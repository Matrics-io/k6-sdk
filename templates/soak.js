/**
 * Soak test template for k6 performance testing SDK
 * 
 * A soak test runs for an extended period to identify issues that might
 * only appear after prolonged use, such as memory leaks or resource exhaustion.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default soak test options - up to 100 VUs
 * Runs for extended periods to identify memory leaks and resource exhaustion
 */
const defaultOptions = {
  stages: [
    { duration: '5m', target: 50 },    // Ramp up to 50 users
    { duration: '10m', target: 100 },  // Ramp up to 100 users
    { duration: '2h', target: 100 },   // Stay at 100 users for 2 hours (soak period)
    { duration: '5m', target: 50 },    // Ramp down to 50 users
    { duration: '5m', target: 0 }      // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>20'],           // Minimum requests per second
    vus_max: ['value<=100'],          // Maximum VUs constraint
    // Soak test specific thresholds
    http_req_connecting: ['p(95)<100'], // Connection time should be stable
    http_req_tls_handshaking: ['p(95)<200'], // TLS handshake should be stable
    // Resource usage should remain stable over time
    checks: ['rate>=0.95']            // Very high success rate expected
  },
  // Extended timeouts for long-running test
  setupTimeout: '120s',
  teardownTimeout: '120s',
  // Batch metrics to reduce memory usage
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)', 'count']
};

/**
 * Create a soak test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createSoakTest(params) {
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
            [`${name} returns 2xx`]: (r) => r.status >= 200 && r.status < 300
          });
        }
        
        // Add realistic sleep between requests (simulate real user behavior)
        sleep(Math.random() * 5 + 2);
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
