/**
 * Ramp test template for k6 performance testing SDK
 * 
 * A ramp test validates system behavior under gradually increasing load
 * to understand performance degradation patterns and scaling characteristics.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default ramp test options
 * Smooth, controlled increase in load to observe performance trends
 */
const defaultOptions = {
  stages: [
    { duration: '1m', target: 25 },    // Ramp to 25 users
    { duration: '2m', target: 25 },    // Hold at 25 users
    { duration: '1m', target: 50 },    // Ramp to 50 users
    { duration: '2m', target: 50 },    // Hold at 50 users
    { duration: '1m', target: 100 },   // Ramp to 100 users
    { duration: '2m', target: 100 },   // Hold at 100 users
    { duration: '1m', target: 200 },   // Ramp to 200 users
    { duration: '2m', target: 200 },   // Hold at 200 users
    { duration: '1m', target: 300 },   // Ramp to 300 users
    { duration: '3m', target: 300 },   // Hold at 300 users
    { duration: '1m', target: 0 }      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1200', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>15'],           // Minimum throughput
    vus_max: ['value<=300'],          // Maximum VUs for ramp test
    // Ramp-specific thresholds
    http_req_waiting: ['p(95)<1000'], // Server processing time
    checks: ['rate>=0.95']            // High success rate expected
  },
  // Standard timeouts
  setupTimeout: '60s',
  teardownTimeout: '60s'
};

/**
 * Performance trend analyzer
 */
class PerformanceTrendAnalyzer {
  constructor() {
    this.samples = [];
    this.trends = {};
  }
  
  addSample(vus, responseTime, throughput, errorRate, timestamp) {
    this.samples.push({
      vus,
      responseTime,
      throughput,
      errorRate,
      timestamp,
      efficiency: throughput / responseTime * 1000 // requests per second per ms
    });
  }
  
  analyzeTrends() {
    if (this.samples.length < 5) return null;
    
    // Group samples by VU ranges
    const ranges = [
      { min: 0, max: 50, name: 'Light Load' },
      { min: 50, max: 100, name: 'Medium Load' },
      { min: 100, max: 200, name: 'Heavy Load' },
      { min: 200, max: 300, name: 'Peak Load' }
    ];
    
    ranges.forEach(range => {
      const rangeSamples = this.samples.filter(s => s.vus >= range.min && s.vus < range.max);
      if (rangeSamples.length > 0) {
        this.trends[range.name] = {
          avgResponseTime: this.average(rangeSamples.map(s => s.responseTime)),
          avgThroughput: this.average(rangeSamples.map(s => s.throughput)),
          avgErrorRate: this.average(rangeSamples.map(s => s.errorRate)),
          efficiency: this.average(rangeSamples.map(s => s.efficiency)),
          samples: rangeSamples.length
        };
      }
    });
    
    return this.trends;
  }
  
  average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  
  detectPerformanceDegradation() {
    const trends = this.analyzeTrends();
    if (!trends) return null;
    
    const degradation = {};
    const loadLevels = Object.keys(trends);
    
    for (let i = 1; i < loadLevels.length; i++) {
      const current = trends[loadLevels[i]];
      const previous = trends[loadLevels[i - 1]];
      
      const responseTimeDelta = ((current.avgResponseTime - previous.avgResponseTime) / previous.avgResponseTime) * 100;
      const throughputDelta = ((current.avgThroughput - previous.avgThroughput) / previous.avgThroughput) * 100;
      
      degradation[loadLevels[i]] = {
        responseTimeIncrease: responseTimeDelta,
        throughputChange: throughputDelta,
        concerning: responseTimeDelta > 50 || throughputDelta < -20
      };
    }
    
    return degradation;
  }
}

/**
 * Create a ramp test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createRampTest(params) {
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
    console.log('Starting ramp test to analyze performance trends...');
    
    // Authenticate if auth is provided
    let authData = {};
    if (auth) {
      const token = auth.getToken();
      authData = { token };
    }
    
    // Initialize trend analyzer
    const trendAnalyzer = new PerformanceTrendAnalyzer();
    
    return {
      ...authData,
      startTime: Date.now(),
      trendAnalyzer,
      testId: `ramp-${Date.now()}`
    };
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
    console.log('Ramp test completed. Analyzing performance trends...');
    
    const testDuration = (Date.now() - data.startTime) / 1000;
    const trends = data.trendAnalyzer.analyzeTrends();
    const degradation = data.trendAnalyzer.detectPerformanceDegradation();
    
    console.log('=== RAMP TEST ANALYSIS ===');
    console.log(`Test ID: ${data.testId}`);
    console.log(`Duration: ${testDuration} seconds`);
    
    if (trends) {
      console.log('\n--- Performance by Load Level ---');
      Object.entries(trends).forEach(([level, metrics]) => {
        console.log(`${level}:`);
        console.log(`  Avg Response Time: ${metrics.avgResponseTime.toFixed(0)}ms`);
        console.log(`  Avg Throughput: ${metrics.avgThroughput.toFixed(1)} req/s`);
        console.log(`  Avg Error Rate: ${(metrics.avgErrorRate * 100).toFixed(2)}%`);
        console.log(`  Efficiency: ${metrics.efficiency.toFixed(2)}`);
        console.log(`  Samples: ${metrics.samples}`);
      });
    }
    
    if (degradation) {
      console.log('\n--- Performance Degradation Analysis ---');
      Object.entries(degradation).forEach(([level, delta]) => {
        const status = delta.concerning ? '⚠️' : '✅';
        console.log(`${status} ${level}:`);
        console.log(`  Response Time: ${delta.responseTimeIncrease > 0 ? '+' : ''}${delta.responseTimeIncrease.toFixed(1)}%`);
        console.log(`  Throughput: ${delta.throughputChange > 0 ? '+' : ''}${delta.throughputChange.toFixed(1)}%`);
      });
    }
    
    console.log('==========================');
    
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
    
    const currentVUs = __VU;
    const iterationStart = Date.now();
    let requestCount = 0;
    let errorCount = 0;
    let totalResponseTime = 0;
    
    // Test each endpoint
    for (const [name, endpoint] of Object.entries(endpoints)) {
      group(`Ramp Test: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1 } = endpoint;
        
        // Skip this endpoint based on weight
        if (Math.random() > weight) {
          return;
        }
        
        // Add ramp test specific tags
        const rampTestTags = {
          ...tags,
          test_type: 'ramp',
          test_id: data.testId,
          endpoint: name,
          current_vus: currentVUs,
          load_level: currentVUs <= 50 ? 'light' :
                     currentVUs <= 100 ? 'medium' :
                     currentVUs <= 200 ? 'heavy' : 'peak'
        };
        
        const requestStart = Date.now();
        
        // Make request
        const response = http.request(method, path, body, { tags: rampTestTags });
        
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
          // Default validation for ramp tests
          const checkResults = check(response, {
            [`${name} successful response`]: (r) => r.status >= 200 && r.status < 300,
            [`${name} acceptable response time`]: (r) => r.timings.duration < 2000,
            [`${name} stable connection`]: (r) => r.timings.connecting >= 0,
            [`${name} content received`]: (r) => r.body.length > 0
          });
          
          if (!Object.values(checkResults).every(result => result)) {
            errorCount++;
          }
        }
        
        // Log significant performance changes
        if (responseTime > 1500) {
          console.log(`📈 Performance notice: ${name} took ${responseTime}ms at ${currentVUs} VUs`);
        }
        
        // Consistent sleep for ramp testing
        sleep(1 + Math.random() * 0.5); // 1-1.5 seconds
      });
    }
    
    // Record trend data
    if (data.trendAnalyzer && requestCount > 0) {
      const iterationDuration = Date.now() - iterationStart;
      const avgResponseTime = totalResponseTime / requestCount;
      const throughput = requestCount / (iterationDuration / 1000);
      const errorRate = errorCount / requestCount;
      
      data.trendAnalyzer.addSample(
        currentVUs,
        avgResponseTime,
        throughput,
        errorRate,
        Date.now()
      );
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
