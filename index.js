/**
 * K6 Performance Testing SDK
 * 
 * This SDK provides a set of utilities and templates for creating
 * performance tests with k6.
 */

// Import test templates
import createSmokeTest from './templates/smoke.js';
import createLoadTest from './templates/load.js';
import createStressTest from './templates/stress.js';
import createSoakTest from './templates/soak.js';

// Import utilities
import { HttpClient } from './utils/http.js';
import { BasicAuthManager, BearerTokenManager, ApiKeyManager, OAuth2Manager } from './utils/auth.js';
import * as helpers from './utils/helpers.js';

/**
 * Create a k6 test configuration
 * @param {Object} config - Test configuration
 * @returns {Object} Test configuration
 */
export function createTestConfig(config) {
  const { baseUrl, auth, endpoints = {} } = config;
  
  // Create HTTP client
  const http = new HttpClient({
    baseUrl,
    headers: config.headers || {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    auth: createAuthManager(auth),
    timeout: config.timeout || 30000,
    validateStatus: config.validateStatus !== false
  });
  
  return {
    config,
    http,
    auth: http.auth,
    endpoints
  };
}

/**
 * Create an authentication manager
 * @param {Object} auth - Authentication configuration
 * @returns {Object} Authentication manager
 */
function createAuthManager(auth) {
  if (!auth) {
    return null;
  }
  
  switch (auth.type) {
    case 'basic':
      return new BasicAuthManager(auth);
    case 'bearer':
      return new BearerTokenManager(auth);
    case 'apiKey':
      return new ApiKeyManager(auth);
    case 'oauth2':
      return new OAuth2Manager(auth);
    default:
      return null;
  }
}

// Export all components
export {
  // Test templates
  createSmokeTest,
  createLoadTest,
  createStressTest,
  createSoakTest,
  
  // HTTP utilities
  HttpClient,
  
  // Authentication utilities
  BasicAuthManager,
  BearerTokenManager,
  ApiKeyManager,
  OAuth2Manager,
  
  // Helper utilities
  helpers
};
