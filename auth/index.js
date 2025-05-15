/**
 * Authentication module for k6 performance testing SDK
 */

import { createTokenManager } from './token-manager.js';
import * as loginFlows from './login-flows.js';

/**
 * Create an authentication manager
 * @param {Object} options - Authentication options
 * @param {string} options.type - Authentication type (basic, oauth2_client_credentials, oauth2_password, form)
 * @param {Object} options.config - Authentication configuration
 * @param {Object} http - HTTP client instance
 * @returns {Object} Authentication manager
 */
export function createAuthManager(options, http) {
  const { type, config } = options;
  
  // Select login function based on type
  let loginFn;
  
  switch (type) {
    case 'basic':
      loginFn = () => loginFlows.basicAuth(http, config);
      break;
    case 'oauth2_client_credentials':
      loginFn = () => loginFlows.oauth2ClientCredentials(http, config);
      break;
    case 'oauth2_password':
      loginFn = () => loginFlows.oauth2Password(http, config);
      break;
    case 'form':
      loginFn = () => loginFlows.formLogin(http, config);
      break;
    case 'custom':
      if (typeof config.loginFn !== 'function') {
        throw new Error('Custom authentication requires a loginFn function');
      }
      loginFn = () => config.loginFn(http);
      break;
    default:
      throw new Error(`Unsupported authentication type: ${type}`);
  }
  
  // Create token manager
  const tokenManager = createTokenManager({
    loginFn,
    expiryBuffer: config.expiryBuffer,
    retryDelay: config.retryDelay,
    maxRetries: config.maxRetries
  });
  
  // Create authentication middleware for HTTP client
  const authMiddleware = async (request) => {
    // Skip authentication for the login endpoint
    if (request.url === config.url) {
      return request;
    }
    
    // Get token
    const token = await tokenManager.getToken();
    
    // Add token to request
    if (token) {
      if (!request.headers) {
        request.headers = {};
      }
      
      const tokenType = config.tokenType || 'Bearer';
      request.headers['Authorization'] = `${tokenType} ${token}`;
    }
    
    return request;
  };
  
  // Apply middleware to HTTP client if supported
  if (http.use) {
    http.use(authMiddleware);
  }
  
  // Return authentication manager
  return {
    getToken: () => tokenManager.getToken(),
    refreshToken: () => tokenManager.refreshToken(),
    setToken: (token, expiresAt) => tokenManager.setToken(token, expiresAt),
    clearToken: () => tokenManager.clearToken(),
    isAuthenticated: () => tokenManager.isTokenValid()
  };
}

// Export login flows
export { basicAuth, oauth2ClientCredentials, oauth2Password, formLogin } from './login-flows.js';

// Default export
export default {
  create: createAuthManager
};
