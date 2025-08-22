/**
 * Breakpoint test template for k6 performance testing SDK
 * 
 * A breakpoint test gradually increases load until the system breaks or 
 * performance becomes unacceptable. It helps identify the maximum capacity.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default breakpoint test options
 * Gradually increase load until system failure or unacceptable performance
 */
const defaultOptions = {
  // Executor for controlled ramping
  executor: 'ramping-vus',
  stages: [
    { duration: '2m', target: 100 },   // Start with 100 users
    { duration: '2m', target: 200 },   // Ramp to 200 users
    { duration: '2m', target: 300 },   // Ramp to 300 users
    { duration: '2m', target: 400 },   // Ramp to 400 users
    { duration: '2m', target: 500 },   // Ramp to 500 users
    { duration: '2m', target: 600 },   // Ramp to 600 users
    { duration: '2m', target: 700 },   // Ramp to 700 users
    { duration: '2m', target: 800 },   // Ramp to 800 users
    { duration: '2m', target: 900 },   // Ramp to 900 users
    { duration: '2m', target: 1000 },  // Ramp to 1000 users
    { duration: '2m', target: 1200 },  // Ramp to 1200 users
    { duration: '2m', target: 1500 },  // Ramp to 1500 users (breaking point)
    { duration: '5m', target: 1500 },  // Hold at potential breaking point
    { duration: '2m', target: 0 }      // Ramp down
  ],
  thresholds: {
    // Progressive thresholds - expect degradation
    http_req_duration: [
      'p(50)<1000',   // 50% under 1s
      'p(95)<5000',   // 95% under 5s  
      'p(99)<10000'   // 99% under 10s
    ],
    http_req_failed: ['rate<0.3'],    // Allow up to 30% failures at breakpoint
    http_reqs: ['rate>10'],           // Minimum throughput
    vus_max: ['value<=1500'],         // Maximum VUs for breakpoint test
    // Breakpoint specific metrics
    http_req_connecting: ['p(95)<500'], // Connection time monitoring
    http_req_tls_handshaking: ['p(95)<1000'], // TLS handshake monitoring
    http_req_sending: ['p(95)<100'],   // Request sending time
    http_req_waiting: ['p(95)<8000'],  // Server processing time
    http_req_receiving: ['p(95)<500'], // Response receiving time
    checks: ['rate>=0.7']             // At least 70% checks pass
  },
  // Extended timeouts for breakpoint conditions
  setupTimeout: '120s',
  teardownTimeout: '120s',
  // Abort test if critical thresholds are exceeded
  abortOnFail: true,
  // Resource monitoring
  systemTags: ['status', 'method', 'url', 'name', 'group', 'check', 'error', 'tls_version', 'scenario', 'service']
};

/**
 * Performance monitoring utility
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      responseTime: [],
      errorRate: [],
      throughput: [],
      vus: []
    };
  }
  
  recordMetrics(responseTime, errorCount, requestCount, currentVUs) {
    this.metrics.responseTime.push(responseTime);
    this.metrics.errorRate.push(errorCount / requestCount);
    this.metrics.throughput.push(requestCount);
    this.metrics.vus.push(currentVUs);
  }
  
  isBreakpointReached() {
    const recentMetrics = this.metrics.responseTime.slice(-10);
    const avgResponseTime = recentMetrics.reduce((a, b) => a + b, 0) / recentMetrics.length;
    
    // Consider breakpoint reached if avg response time > 10s
    return avgResponseTime > 10000;
  }
}

/**
 * Create a breakpoint test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createBreakpointTest(params) {
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
    console.log('Starting breakpoint test to find system limits...');
    
    // Authenticate if auth is provided
    let authData = {};
    if (auth) {
      const token = auth.getToken();
      authData = { token };
    }
    
    // Initialize performance monitoring
    const monitor = new PerformanceMonitor();
    
    return {
      ...authData,
      startTime: Date.now(),
      monitor
    };
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
    console.log('Breakpoint test completed. Analyzing results...');
    
    const testDuration = (Date.now() - data.startTime) / 1000;
    console.log(`Test duration: ${testDuration} seconds`);
    
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
    const currentIteration = __ITER;
    let requestCount = 0;
    let errorCount = 0;
    let totalResponseTime = 0;
    
    // Test each endpoint
    for (const [name, endpoint] of Object.entries(endpoints)) {
      group(`Breakpoint Test: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1 } = endpoint;
        
        // Skip this endpoint based on weight
        if (Math.random() > weight) {
          return;
        }
        
        // Add breakpoint test specific tags
        const breakpointTestTags = {
          ...tags,
          test_type: 'breakpoint',
          current_vus: currentVUs,
          iteration: currentIteration,
          load_phase: currentVUs < 500 ? 'ramp-up' : 
                     currentVUs < 1000 ? 'stress' : 'breakpoint'
        };
        
        const startTime = Date.now();
        
        // Make request
        const response = http.request(method, path, body, { tags: breakpointTestTags });
        
        const responseTime = Date.now() - startTime;
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
          // Default validation for breakpoint tests
          const checkResults = check(response, {
            [`${name} system still responding`]: (r) => r.status !== 0 && r.timings.duration > 0,
            [`${name} not completely broken`]: (r) => r.status !== 502 && r.status !== 503,
            [`${name} response time under 30s`]: (r) => r.timings.duration < 30000,
            [`${name} response received`]: (r) => r.body.length > 0
          });
          
          if (!checkResults) errorCount++;
        }
        
        // Log performance degradation
        if (responseTime > 5000) {
          console.log(`Warning: Slow response (${responseTime}ms) for ${name} at ${currentVUs} VUs`);
        }
        
        if (responseTime > 15000) {
          console.log(`Critical: Very slow response (${responseTime}ms) for ${name} at ${currentVUs} VUs - possible breakpoint`);
        }
        
        // Adaptive sleep based on current load and response time
        let sleepTime = 1;
        if (currentVUs > 1000) {
          // At high load, reduce sleep to maintain pressure
          sleepTime = Math.max(0.1, 1 - (currentVUs - 1000) / 1000);
        } else {
          // Normal sleep pattern
          sleepTime = Math.random() * 2 + 0.5;
        }
        
        sleep(sleepTime);
      });
    }
    
    // Record metrics for analysis
    if (data.monitor && requestCount > 0) {
      const avgResponseTime = totalResponseTime / requestCount;
      data.monitor.recordMetrics(avgResponseTime, errorCount, requestCount, currentVUs);
      
      // Check if breakpoint is reached
      if (data.monitor.isBreakpointReached()) {
        console.log(`Breakpoint detected at ${currentVUs} VUs - average response time exceeds 10s`);
      }
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
