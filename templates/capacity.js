/**
 * Capacity test template for k6 performance testing SDK
 * 
 * A capacity test determines the optimal operating capacity of the system
 * by finding the maximum load it can handle while maintaining acceptable performance.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default capacity test options
 * Gradually increase load to find optimal capacity point
 */
const defaultOptions = {
  stages: [
    { duration: '2m', target: 50 },    // Warm up
    { duration: '3m', target: 100 },   // Light load
    { duration: '3m', target: 200 },   // Moderate load
    { duration: '3m', target: 300 },   // Heavy load
    { duration: '3m', target: 400 },   // High load
    { duration: '3m', target: 500 },   // Peak load
    { duration: '5m', target: 500 },   // Sustain peak
    { duration: '2m', target: 0 }      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<2500'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>25'],           // Minimum throughput requirement
    vus_max: ['value<=500'],          // Maximum VUs for capacity test
    // Capacity specific thresholds
    http_req_connecting: ['p(95)<200'], // Connection establishment
    http_req_tls_handshaking: ['p(95)<300'], // TLS handshake time
    http_req_sending: ['p(95)<100'],   // Request sending time
    http_req_waiting: ['p(95)<1200'],  // Server processing time
    http_req_receiving: ['p(95)<200'], // Response receiving time
    checks: ['rate>=0.95']            // High success rate for capacity
  },
  // Capacity test timeouts
  setupTimeout: '90s',
  teardownTimeout: '90s'
};

/**
 * Capacity analyzer for determining optimal load
 */
class CapacityAnalyzer {
  constructor() {
    this.dataPoints = [];
    this.optimalCapacity = null;
  }
  
  addDataPoint(vus, responseTime, throughput, errorRate, timestamp) {
    this.dataPoints.push({
      vus,
      responseTime,
      throughput,
      errorRate,
      timestamp,
      efficiency: this.calculateEfficiency(responseTime, throughput, errorRate)
    });
  }
  
  calculateEfficiency(responseTime, throughput, errorRate) {
    // Efficiency metric: throughput per response time, penalized by errors
    const errorPenalty = 1 - errorRate;
    const timeEfficiency = throughput / (responseTime / 1000); // requests per second per second response time
    return timeEfficiency * errorPenalty;
  }
  
  findOptimalCapacity() {
    if (this.dataPoints.length < 3) return null;
    
    // Find the point where efficiency starts to decline significantly
    let maxEfficiency = 0;
    let optimalPoint = null;
    
    for (let i = 1; i < this.dataPoints.length - 1; i++) {
      const current = this.dataPoints[i];
      const previous = this.dataPoints[i - 1];
      const next = this.dataPoints[i + 1];
      
      // Check if this is a peak efficiency point
      if (current.efficiency > maxEfficiency && 
          current.responseTime < 1500 && 
          current.errorRate < 0.05) {
        maxEfficiency = current.efficiency;
        optimalPoint = current;
      }
      
      // Check for efficiency degradation
      if (current.efficiency < previous.efficiency * 0.9) {
        // Efficiency dropped by 10% - potential capacity limit
        break;
      }
    }
    
    this.optimalCapacity = optimalPoint;
    return optimalPoint;
  }
  
  getCapacityReport() {
    const optimal = this.findOptimalCapacity();
    const maxDataPoint = this.dataPoints.reduce((max, point) => 
      point.vus > max.vus ? point : max, this.dataPoints[0] || {});
    
    return {
      optimalCapacity: optimal,
      maxTested: maxDataPoint,
      totalDataPoints: this.dataPoints.length,
      recommendations: this.generateRecommendations(optimal, maxDataPoint)
    };
  }
  
  generateRecommendations(optimal, max) {
    const recommendations = [];
    
    if (optimal) {
      recommendations.push(`Optimal capacity: ${optimal.vus} VUs with ${optimal.throughput.toFixed(1)} req/s`);
      recommendations.push(`At optimal: ${optimal.responseTime.toFixed(0)}ms avg response, ${(optimal.errorRate * 100).toFixed(2)}% errors`);
      
      // Safety margin recommendation
      const safetyMargin = Math.floor(optimal.vus * 0.8);
      recommendations.push(`Recommended production capacity: ${safetyMargin} VUs (80% of optimal for safety margin)`);
    }
    
    if (max && max.errorRate > 0.05) {
      recommendations.push(`Warning: Error rate exceeded 5% at ${max.vus} VUs`);
    }
    
    if (max && max.responseTime > 2000) {
      recommendations.push(`Warning: Response time exceeded 2s at ${max.vus} VUs`);
    }
    
    return recommendations;
  }
}

/**
 * Create a capacity test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createCapacityTest(params) {
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
    console.log('Starting capacity test to determine optimal system capacity...');
    
    // Authenticate if auth is provided
    let authData = {};
    if (auth) {
      const token = auth.getToken();
      authData = { token };
    }
    
    // Initialize capacity analyzer
    const capacityAnalyzer = new CapacityAnalyzer();
    
    return {
      ...authData,
      startTime: Date.now(),
      capacityAnalyzer,
      testId: `capacity-${Date.now()}`
    };
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
    console.log('Capacity test completed. Analyzing optimal capacity...');
    
    const testDuration = (Date.now() - data.startTime) / 1000;
    const report = data.capacityAnalyzer.getCapacityReport();
    
    console.log('=== CAPACITY ANALYSIS REPORT ===');
    console.log(`Test ID: ${data.testId}`);
    console.log(`Duration: ${testDuration} seconds`);
    console.log(`Data points collected: ${report.totalDataPoints}`);
    
    if (report.optimalCapacity) {
      console.log('\n--- Optimal Capacity ---');
      console.log(`VUs: ${report.optimalCapacity.vus}`);
      console.log(`Throughput: ${report.optimalCapacity.throughput.toFixed(1)} req/s`);
      console.log(`Avg Response Time: ${report.optimalCapacity.responseTime.toFixed(0)}ms`);
      console.log(`Error Rate: ${(report.optimalCapacity.errorRate * 100).toFixed(2)}%`);
      console.log(`Efficiency Score: ${report.optimalCapacity.efficiency.toFixed(2)}`);
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n--- Recommendations ---');
      report.recommendations.forEach(rec => console.log(`• ${rec}`));
    }
    
    console.log('================================');
    
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
      group(`Capacity Test: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1 } = endpoint;
        
        // Skip this endpoint based on weight
        if (Math.random() > weight) {
          return;
        }
        
        // Add capacity test specific tags
        const capacityTestTags = {
          ...tags,
          test_type: 'capacity',
          test_id: data.testId,
          endpoint: name,
          current_vus: currentVUs,
          load_phase: currentVUs < 200 ? 'light' : 
                     currentVUs < 400 ? 'moderate' : 'heavy'
        };
        
        const requestStart = Date.now();
        
        // Make request
        const response = http.request(method, path, body, { tags: capacityTestTags });
        
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
          // Default validation for capacity tests
          const checkResults = check(response, {
            [`${name} successful response`]: (r) => r.status >= 200 && r.status < 300,
            [`${name} acceptable response time`]: (r) => r.timings.duration < 3000,
            [`${name} response content valid`]: (r) => r.body.length > 0,
            [`${name} no timeout errors`]: (r) => r.status !== 408 && r.timings.duration > 0
          });
          
          if (!checkResults) errorCount++;
        }
        
        // Log capacity metrics periodically
        if (__ITER % 50 === 0) {
          console.log(`Capacity check: ${currentVUs} VUs, ${responseTime}ms response, ${name}`);
        }
        
        // Adaptive sleep based on load
        const baseSleep = 1;
        const loadFactor = Math.min(currentVUs / 300, 2); // Scale up to 2x sleep at 300+ VUs
        sleep(baseSleep / loadFactor + Math.random() * 0.5);
      });
    }
    
    // Record capacity metrics
    if (data.capacityAnalyzer && requestCount > 0) {
      const iterationDuration = Date.now() - iterationStart;
      const avgResponseTime = totalResponseTime / requestCount;
      const throughput = requestCount / (iterationDuration / 1000);
      const errorRate = errorCount / requestCount;
      
      data.capacityAnalyzer.addDataPoint(
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
