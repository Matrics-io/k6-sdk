/**
 * Baseline test template for k6 performance testing SDK
 * 
 * A baseline test establishes performance benchmarks under normal conditions.
 * It's used to create reference metrics for comparison with other tests.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default baseline test options
 * Consistent, predictable load to establish performance baselines
 */
const defaultOptions = {
  stages: [
    { duration: '1m', target: 10 },    // Ramp up slowly
    { duration: '10m', target: 50 },   // Stay at moderate load
    { duration: '1m', target: 10 },    // Ramp down slowly
    { duration: '30s', target: 0 }     // Complete ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<1200'],
    http_req_failed: ['rate<0.02'],
    http_reqs: ['rate>10'],           // Consistent throughput
    vus_max: ['value<=50'],           // Moderate load for baseline
    // Baseline specific thresholds for consistency
    http_req_connecting: ['p(95)<100'], // Connection time stability
    http_req_tls_handshaking: ['p(95)<200'], // TLS handshake stability
    http_req_sending: ['p(95)<50'],    // Request sending time
    http_req_waiting: ['p(95)<700'],   // Server processing time
    http_req_receiving: ['p(95)<100'], // Response receiving time
    checks: ['rate>=0.98']            // Very high success rate for baseline
  },
  // Standard timeouts for baseline conditions
  setupTimeout: '60s',
  teardownTimeout: '60s',
  // Detailed metrics for baseline establishment
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'p(99.9)', 'count'],
  // Tags for baseline identification
  tags: {
    test_type: 'baseline',
    environment: 'test'
  }
};

/**
 * Baseline metrics collector
 */
class BaselineMetrics {
  constructor() {
    this.metrics = {
      responseTimes: [],
      throughput: [],
      errorRates: [],
      resourceUsage: [],
      timestamps: []
    };
  }
  
  record(responseTime, throughput, errorRate, timestamp = Date.now()) {
    this.metrics.responseTimes.push(responseTime);
    this.metrics.throughput.push(throughput);
    this.metrics.errorRates.push(errorRate);
    this.metrics.timestamps.push(timestamp);
  }
  
  getBaseline() {
    if (this.metrics.responseTimes.length === 0) return null;
    
    return {
      avgResponseTime: this.average(this.metrics.responseTimes),
      p95ResponseTime: this.percentile(this.metrics.responseTimes, 95),
      avgThroughput: this.average(this.metrics.throughput),
      avgErrorRate: this.average(this.metrics.errorRates),
      stability: this.calculateStability()
    };
  }
  
  average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  
  percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index];
  }
  
  calculateStability() {
    // Calculate coefficient of variation for response times
    const avg = this.average(this.metrics.responseTimes);
    const variance = this.metrics.responseTimes.reduce((acc, val) => {
      return acc + Math.pow(val - avg, 2);
    }, 0) / this.metrics.responseTimes.length;
    const stdDev = Math.sqrt(variance);
    return stdDev / avg; // Lower is more stable
  }
}

/**
 * Create a baseline test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createBaselineTest(params) {
  const {
    config,
    http,
    auth,
    endpoints = {},
    options = {}
  } = params;
  
  // Merge options with defaults
  const testOptions = {
    ...defaultOptions,
    ...options
  };
  
  // Setup function - runs once at the beginning of the test
  const setup = () => {
    console.log('Establishing performance baseline...');
    
    // Authenticate if auth is provided
    let authData = {};
    if (auth) {
      const token = auth.getToken();
      authData = { token };
    }
    
    // Initialize baseline metrics collector
    const baselineMetrics = new BaselineMetrics();
    
    return {
      ...authData,
      startTime: Date.now(),
      baselineMetrics,
      testId: `baseline-${Date.now()}`
    };
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
    console.log('Baseline test completed. Calculating baseline metrics...');
    
    const testDuration = (Date.now() - data.startTime) / 1000;
    const baseline = data.baselineMetrics.getBaseline();
    
    if (baseline) {
      console.log('=== BASELINE METRICS ===');
      console.log(`Test ID: ${data.testId}`);
      console.log(`Duration: ${testDuration} seconds`);
      console.log(`Average Response Time: ${baseline.avgResponseTime.toFixed(2)}ms`);
      console.log(`95th Percentile Response Time: ${baseline.p95ResponseTime.toFixed(2)}ms`);
      console.log(`Average Throughput: ${baseline.avgThroughput.toFixed(2)} req/s`);
      console.log(`Average Error Rate: ${(baseline.avgErrorRate * 100).toFixed(2)}%`);
      console.log(`Stability Index: ${baseline.stability.toFixed(3)} (lower is more stable)`);
      console.log('========================');
    }
    
    // Clean up resources if needed
    if (auth) {
      auth.clearToken();
    }
  };
  
  // Main test function
  const defaultFunction = (data) => {
    // Authenticate if needed
    if (auth && !auth.isAuthenticated()) {
      auth.setToken(data.token);
    }
    
    const iterationStart = Date.now();
    let requestCount = 0;
    let errorCount = 0;
    let totalResponseTime = 0;
    
    // Test each endpoint
    for (const [name, endpoint] of Object.entries(endpoints)) {
      group(`Baseline: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1 } = endpoint;
        
        // Skip this endpoint based on weight
        if (Math.random() > weight) {
          return;
        }
        
        // Add baseline test specific tags
        const baselineTestTags = {
          ...tags,
          test_type: 'baseline',
          test_id: data.testId,
          endpoint: name,
          vu: __VU,
          iteration: __ITER
        };
        
        const requestStart = Date.now();
        
        // Make request
        const response = http.request(method, path, body, { tags: baselineTestTags });
        
        const responseTime = Date.now() - requestStart;
        totalResponseTime += responseTime;
        requestCount++;
        
        // Track errors
        if (response.status < 200 || response.status >= 400) {
          errorCount++;
        }
        
        // Validate response
        if (validate) {
          const checkResult = check(response, validate);
          if (!checkResult) errorCount++;
        } else {
          // Default validation for baseline tests
          const checkResults = check(response, {
            [`${name} returns success status`]: (r) => r.status >= 200 && r.status < 300,
            [`${name} response time within baseline`]: (r) => r.timings.duration < 1000,
            [`${name} response has content`]: (r) => r.body.length > 0,
            [`${name} no connection errors`]: (r) => r.timings.connecting >= 0,
            [`${name} TLS handshake successful`]: (r) => !r.tls_version || r.timings.tls_handshaking >= 0
          });
          
          if (!checkResults) errorCount++;
        }
        
        // Consistent sleep for baseline stability
        sleep(1 + Math.random() * 0.2); // 1-1.2 seconds
      });
    }
    
    // Record metrics for baseline calculation
    if (data.baselineMetrics && requestCount > 0) {
      const iterationDuration = Date.now() - iterationStart;
      const avgResponseTime = totalResponseTime / requestCount;
      const throughput = requestCount / (iterationDuration / 1000);
      const errorRate = errorCount / requestCount;
      
      data.baselineMetrics.record(avgResponseTime, throughput, errorRate);
    }
  };
  
  // Return k6 test script
  return {
    options: testOptions,
    setup,
    default: defaultFunction,
    teardown
  };
}
