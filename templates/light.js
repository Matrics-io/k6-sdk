/**
 * Light test template for k6 performance testing SDK
 * 
 * A very light and fast test for quick validation, CI/CD integration,
 * and basic functionality checks. Minimal resource usage and execution time.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default light test options
 * Ultra-fast execution with single user for immediate feedback
 */
const defaultOptions = {
  vus: 1,
  duration: '20s',
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>=0.99']            // Very high success rate expected
  },
  // Quick timeouts for fast execution
  setupTimeout: '5s',
  teardownTimeout: '5s',
  // Minimal summary for speed
  summaryTrendStats: ['avg', 'count']
};

/**
 * Quick health checker utility
 */
class QuickHealthChecker {
  constructor() {
    this.checks = {
      total: 0,
      passed: 0,
      failed: 0,
      endpoints: {}
    };
  }
  
  recordCheck(endpoint, passed) {
    this.checks.total++;
    if (passed) {
      this.checks.passed++;
    } else {
      this.checks.failed++;
    }
    
    if (!this.checks.endpoints[endpoint]) {
      this.checks.endpoints[endpoint] = { total: 0, passed: 0 };
    }
    
    this.checks.endpoints[endpoint].total++;
    if (passed) {
      this.checks.endpoints[endpoint].passed++;
    }
  }
  
  getHealthStatus() {
    const overallHealth = this.checks.total > 0 ? 
      (this.checks.passed / this.checks.total) * 100 : 0;
    
    return {
      overall: overallHealth,
      status: overallHealth >= 99 ? 'HEALTHY' : 
              overallHealth >= 95 ? 'WARNING' : 'UNHEALTHY',
      details: this.checks
    };
  }
}

/**
 * Create a light test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createLightTest(params) {
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
    console.log('Starting light test for quick validation...');
    
    // Authenticate if auth is provided
    let authData = {};
    if (auth) {
      const token = auth.getToken();
      authData = { token };
    }
    
    // Initialize quick health checker
    const healthChecker = new QuickHealthChecker();
    
    return {
      ...authData,
      startTime: Date.now(),
      healthChecker,
      testId: `light-${Date.now()}`
    };
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
    const testDuration = (Date.now() - data.startTime) / 1000;
    const healthStatus = data.healthChecker.getHealthStatus();
    
    console.log('=== LIGHT TEST RESULTS ===');
    console.log(`Test ID: ${data.testId}`);
    console.log(`Duration: ${testDuration.toFixed(1)} seconds`);
    console.log(`Overall Health: ${healthStatus.overall.toFixed(1)}% - ${healthStatus.status}`);
    console.log(`Checks: ${healthStatus.details.passed}/${healthStatus.details.total} passed`);
    
    // Per-endpoint summary
    Object.entries(healthStatus.details.endpoints).forEach(([endpoint, stats]) => {
      const endpointHealth = (stats.passed / stats.total) * 100;
      console.log(`  ${endpoint}: ${endpointHealth.toFixed(0)}% (${stats.passed}/${stats.total})`);
    });
    
    // CI/CD friendly exit status
    if (healthStatus.overall < 95) {
      console.log('❌ Light test FAILED - System health below threshold');
    } else {
      console.log('✅ Light test PASSED - System healthy');
    }
    
    console.log('=========================');
    
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
    
    // Test each endpoint with minimal overhead
    for (const [name, endpoint] of Object.entries(endpoints)) {
      group(`Light: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1 } = endpoint;
        
        // Skip this endpoint based on weight
        if (Math.random() > weight) {
          return;
        }
        
        // Add light test specific tags
        const lightTestTags = {
          ...tags,
          test_type: 'light',
          test_id: data.testId,
          endpoint: name
        };
        
        // Make request
        const response = http.request(method, path, body, { tags: lightTestTags });
        
        let allChecksPassed = true;
        
        // Validate response
        if (validate) {
          const checkResult = check(response, validate);
          allChecksPassed = checkResult;
        } else {
          // Default validation for light tests - focused on basic functionality
          const checkResults = check(response, {
            [`${name} is reachable`]: (r) => r.status !== 0,
            [`${name} returns success`]: (r) => r.status >= 200 && r.status < 300,
            [`${name} responds quickly`]: (r) => r.timings.duration < 500,
            [`${name} has content`]: (r) => r.body && r.body.length > 0
          });
          
          allChecksPassed = Object.values(checkResults).every(result => result);
        }
        
        // Record health check
        data.healthChecker.recordCheck(name, allChecksPassed);
        
        // Log any issues immediately for quick feedback
        if (!allChecksPassed) {
          console.log(`⚠️  Issue detected in ${name}: Status ${response.status}, Duration ${response.timings.duration}ms`);
        }
        
        // Minimal sleep for ultra-fast execution
        sleep(0.5); // Fixed 0.5 seconds for consistency
      });
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
