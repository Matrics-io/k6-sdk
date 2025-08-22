/**
 * Smoke test template for k6 performance testing SDK
 * 
 * A smoke test is a simple test to verify that the system works under minimal load.
 * It typically runs with a single user for a short duration.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default smoke test options
 * Simple test to verify basic functionality with minimal load
 */
const defaultOptions = {
  stages: [
    { duration: '30s', target: 1 },   // Single user for 30 seconds
    { duration: '1m', target: 5 },    // Ramp up to 5 users
    { duration: '30s', target: 1 },   // Ramp down to 1 user
    { duration: '10s', target: 0 }    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>1'],            // At least 1 request per second
    vus_max: ['value<=5'],            // Maximum 5 VUs for smoke test
    checks: ['rate>=0.99'],           // 99% of checks should pass
    // Connection stability checks
    http_req_connecting: ['p(95)<50'],
    http_req_receiving: ['p(95)<50']
  },
  // Quick timeouts for smoke tests
  setupTimeout: '30s',
  teardownTimeout: '30s'
};

/**
 * Create a smoke test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createSmokeTest(params) {
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
        const { method = 'GET', path, body, validate, tags = {} } = endpoint;
        
        // Make request
        const response = http.request(method, path, body, { tags });
        
        // Validate response
        if (validate) {
          check(response, validate);
        } else {
          // Default validation
          check(response, {
            [`${name} returns 2xx`]: (r) => r.status >= 200 && r.status < 300
          });
        }
        
        // Add sleep between requests
        sleep(1);
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
