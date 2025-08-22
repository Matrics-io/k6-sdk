/**
 * Spike test template for k6 performance testing SDK
 * 
 * A spike test validates system behavior under sudden, extreme load increases.
 * It tests the system's ability to handle traffic spikes and recover gracefully.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default spike test options
 * Sudden increase to high load, then immediate drop
 */
const defaultOptions = {
  stages: [
    { duration: '2m', target: 100 },   // Normal load baseline
    { duration: '1m', target: 100 },   // Stay at baseline
    { duration: '10s', target: 1400 }, // Sudden spike to 1400 users
    { duration: '3m', target: 1400 },  // Maintain spike load
    { duration: '10s', target: 100 },  // Sudden drop back to baseline
    { duration: '3m', target: 100 },   // Recovery period
    { duration: '1m', target: 0 }      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.1'],
    http_reqs: ['rate>50'],           // Minimum requests per second
    vus_max: ['value<=1400'],         // Maximum VUs during spike
    // Spike test specific thresholds
    http_req_waiting: ['p(95)<1000'], // Server processing time
    checks: ['rate>=0.85']            // 85% of checks should pass during spike
  },
  // Extended timeouts for spike conditions
  setupTimeout: '60s',
  teardownTimeout: '60s'
};

/**
 * Create a spike test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createSpikeTest(params) {
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
    // Authenticate if auth is provided
    if (auth) {
      const token = auth.getToken();
      return { token };
    }
    return {};
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
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
    
    // Test each endpoint
    for (const [name, endpoint] of Object.entries(endpoints)) {
      group(`Endpoint: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1 } = endpoint;
        
        // Skip this endpoint based on weight (for traffic distribution)
        if (Math.random() > weight) {
          return;
        }
        
        // Add spike test specific tags
        const spikeTestTags = {
          ...tags,
          test_type: 'spike',
          spike_phase: __VU <= 100 ? 'baseline' : 'spike'
        };
        
        // Make request
        const response = http.request(method, path, body, { tags: spikeTestTags });
        
        // Validate response
        if (validate) {
          check(response, validate);
        } else {
          // Default validation - more lenient during spike
          check(response, {
            [`${name} returns 2xx or recoverable 5xx`]: (r) => 
              (r.status >= 200 && r.status < 300) || 
              (r.status >= 500 && r.status !== 502), // 502s indicate real problems
            [`${name} response time acceptable`]: (r) => r.timings.duration < 5000
          });
        }
        
        // Variable sleep based on current load
        const currentVUs = __VU;
        if (currentVUs > 1000) {
          // During spike - minimal sleep
          sleep(Math.random() * 0.5 + 0.1);
        } else {
          // During baseline - normal sleep
          sleep(Math.random() * 2 + 0.5);
        }
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
