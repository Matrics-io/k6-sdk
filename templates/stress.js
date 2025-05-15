/**
 * Stress test template for k6 performance testing SDK
 * 
 * A stress test pushes the system beyond normal operational capacity
 * to identify breaking points and performance degradation.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default stress test options
 */
const defaultOptions = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 10 },   // Stay at 10 users
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 30 },   // Ramp up to 30 users
    { duration: '5m', target: 30 },   // Stay at 30 users
    { duration: '2m', target: 0 }     // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.1']
  }
};

/**
 * Create a stress test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createStressTest(params) {
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
        
        // Make request
        const response = http.request(method, path, body, { tags });
        
        // Validate response
        if (validate) {
          check(response, validate);
        } else {
          // Default validation
          check(response, {
            [`${name} returns 2xx or 5xx`]: (r) => (r.status >= 200 && r.status < 300) || (r.status >= 500)
          });
        }
        
        // Add minimal sleep between requests (stress test should have minimal delays)
        sleep(Math.random() * 1 + 0.5);
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
