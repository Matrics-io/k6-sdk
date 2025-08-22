/**
 * Volume test template for k6 performance testing SDK
 * 
 * A volume test verifies system behavior when processing large amounts of data.
 * It focuses on data processing capacity rather than concurrent user load.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default volume test options
 * Moderate concurrent users but high data volume per request
 */
const defaultOptions = {
  stages: [
    { duration: '2m', target: 10 },    // Ramp up to 10 users
    { duration: '5m', target: 50 },    // Ramp up to 50 users
    { duration: '20m', target: 50 },   // Stay at 50 users for extended period
    { duration: '5m', target: 10 },    // Ramp down to 10 users
    { duration: '2m', target: 0 }      // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'], // Higher latency expected
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>5'],            // Lower request rate, higher data volume
    vus_max: ['value<=50'],           // Moderate VUs for volume test
    // Volume test specific thresholds
    data_sent: ['rate>1048576'],      // At least 1MB/s data sent
    data_received: ['rate>1048576'],  // At least 1MB/s data received
    http_req_sending: ['p(95)<1000'], // Time to send request data
    http_req_receiving: ['p(95)<2000'], // Time to receive response data
    checks: ['rate>=0.95']            // High success rate expected
  },
  // Extended timeouts for large data processing
  setupTimeout: '120s',
  teardownTimeout: '120s'
};

/**
 * Generate large payload for volume testing
 * @param {number} sizeKB - Size in kilobytes
 * @returns {string} Large string payload
 */
function generateLargePayload(sizeKB = 100) {
  const chunkSize = 1024; // 1KB chunks
  const chunks = sizeKB;
  let payload = '';
  
  for (let i = 0; i < chunks; i++) {
    payload += 'A'.repeat(chunkSize);
  }
  
  return payload;
}

/**
 * Generate large dataset for testing
 * @param {number} recordCount - Number of records
 * @returns {Array} Array of test records
 */
function generateLargeDataset(recordCount = 1000) {
  const records = [];
  
  for (let i = 0; i < recordCount; i++) {
    records.push({
      id: i,
      timestamp: new Date().toISOString(),
      data: `Large data record ${i} with additional content to increase size`,
      metadata: {
        source: 'volume-test',
        size: 'large',
        index: i,
        randomValue: Math.random() * 1000000
      },
      payload: generateLargePayload(1) // 1KB per record
    });
  }
  
  return records;
}

/**
 * Create a volume test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createVolumeTest(params) {
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
    console.log('Setting up volume test with large datasets...');
    
    // Authenticate if auth is provided
    let authData = {};
    if (auth) {
      const token = auth.getToken();
      authData = { token };
    }
    
    // Generate test datasets
    const largeDataset = generateLargeDataset(1000);
    const bulkPayload = generateLargePayload(500); // 500KB payload
    
    return {
      ...authData,
      largeDataset,
      bulkPayload
    };
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
    console.log('Cleaning up volume test resources...');
    
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
    
    // Test each endpoint with volume scenarios
    for (const [name, endpoint] of Object.entries(endpoints)) {
      group(`Volume Test: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1, volumeType = 'payload' } = endpoint;
        
        // Skip this endpoint based on weight
        if (Math.random() > weight) {
          return;
        }
        
        // Add volume test specific tags
        const volumeTestTags = {
          ...tags,
          test_type: 'volume',
          volume_type: volumeType,
          vu: __VU,
          iteration: __ITER
        };
        
        let requestBody = body;
        
        // Prepare volume-specific request body
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
          switch (volumeType) {
            case 'bulk':
              // Use large dataset for bulk operations
              requestBody = JSON.stringify({
                records: data.largeDataset.slice(0, 100), // 100 records per request
                metadata: { test: 'volume', timestamp: new Date().toISOString() }
              });
              break;
            case 'payload':
              // Use large payload
              requestBody = JSON.stringify({
                data: data.bulkPayload,
                metadata: { test: 'volume', size: '500KB' }
              });
              break;
            case 'file':
              // Simulate file upload
              requestBody = data.bulkPayload;
              volumeTestTags.content_type = 'application/octet-stream';
              break;
            default:
              requestBody = body || JSON.stringify({
                data: generateLargePayload(50), // 50KB default
                timestamp: new Date().toISOString()
              });
          }
        }
        
        // Make request with volume data
        const response = http.request(method, path, requestBody, { 
          tags: volumeTestTags,
          headers: {
            'Content-Type': volumeType === 'file' ? 'application/octet-stream' : 'application/json',
            ...endpoint.headers
          }
        });
        
        // Validate response
        if (validate) {
          check(response, validate);
        } else {
          // Default validation for volume tests
          check(response, {
            [`${name} handles large data successfully`]: (r) => r.status >= 200 && r.status < 300,
            [`${name} response time acceptable for volume`]: (r) => r.timings.duration < 10000,
            [`${name} no memory errors`]: (r) => !r.body.includes('OutOfMemory') && !r.body.includes('memory'),
            [`${name} response size reasonable`]: (r) => r.body.length < 10485760 // 10MB max response
          });
        }
        
        // Longer sleep between volume requests
        sleep(Math.random() * 3 + 2); // 2-5 seconds
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
