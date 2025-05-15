/**
 * Authentication utilities for k6 performance testing SDK
 */

import http from 'k6/http';
import { check } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * Basic authentication manager
 */
export class BasicAuthManager {
  /**
   * Create a basic authentication manager
   * @param {Object} config - Authentication configuration
   * @param {string} config.username - Username
   * @param {string} config.password - Password
   */
  constructor(config) {
    this.username = config.username;
    this.password = config.password;
  }
  
  /**
   * Get basic auth credentials
   * @returns {Object} Basic auth credentials
   */
  getCredentials() {
    return {
      username: this.username,
      password: this.password
    };
  }
  
  /**
   * Apply basic auth to request params
   * @param {Object} params - Request parameters
   * @returns {Object} Updated request parameters
   */
  applyToRequest(params = {}) {
    return {
      ...params,
      auth: `${this.username}:${this.password}`
    };
  }
}

/**
 * Bearer token authentication manager
 */
export class BearerTokenManager {
  /**
   * Create a bearer token authentication manager
   * @param {Object} config - Authentication configuration
   * @param {string} [config.token] - Initial token
   * @param {Object} [config.tokenEndpoint] - Token endpoint configuration
   * @param {string} config.tokenEndpoint.url - Token endpoint URL
   * @param {Object} config.tokenEndpoint.params - Token endpoint parameters
   */
  constructor(config) {
    this.token = config.token || null;
    this.tokenEndpoint = config.tokenEndpoint || null;
  }
  
  /**
   * Check if authenticated
   * @returns {boolean} True if authenticated
   */
  isAuthenticated() {
    return !!this.token;
  }
  
  /**
   * Get token
   * @returns {string} Token
   */
  getToken() {
    if (!this.token && this.tokenEndpoint) {
      this.fetchToken();
    }
    return this.token;
  }
  
  /**
   * Set token
   * @param {string} token - Token
   */
  setToken(token) {
    this.token = token;
  }
  
  /**
   * Clear token
   */
  clearToken() {
    this.token = null;
  }
  
  /**
   * Fetch token from endpoint
   * @returns {string} Token
   */
  fetchToken() {
    if (!this.tokenEndpoint) {
      throw new Error('Token endpoint not configured');
    }
    
    const { url, params } = this.tokenEndpoint;
    const response = http.post(url, params.body || {}, params.options || {});
    
    check(response, {
      'Token request successful': (r) => r.status === 200
    });
    
    if (response.status === 200) {
      try {
        const data = JSON.parse(response.body);
        this.token = data.access_token || data.token;
        return this.token;
      } catch (e) {
        throw new Error(`Failed to parse token response: ${e.message}`);
      }
    } else {
      throw new Error(`Failed to fetch token: ${response.status} ${response.body}`);
    }
  }
  
  /**
   * Apply bearer token to request params
   * @param {Object} params - Request parameters
   * @returns {Object} Updated request parameters
   */
  applyToRequest(params = {}) {
    const token = this.getToken();
    if (!token) {
      return params;
    }
    
    const headers = {
      ...(params.headers || {}),
      'Authorization': `Bearer ${token}`
    };
    
    return {
      ...params,
      headers
    };
  }
}

/**
 * API key authentication manager
 */
export class ApiKeyManager {
  /**
   * Create an API key authentication manager
   * @param {Object} config - Authentication configuration
   * @param {string} config.key - API key
   * @param {string} [config.headerName='X-API-Key'] - Header name
   * @param {string} [config.paramName='api_key'] - Query parameter name
   * @param {string} [config.location='header'] - Location ('header' or 'query')
   */
  constructor(config) {
    this.key = config.key;
    this.headerName = config.headerName || 'X-API-Key';
    this.paramName = config.paramName || 'api_key';
    this.location = config.location || 'header';
  }
  
  /**
   * Get API key
   * @returns {string} API key
   */
  getKey() {
    return this.key;
  }
  
  /**
   * Apply API key to request params
   * @param {Object} params - Request parameters
   * @returns {Object} Updated request parameters
   */
  applyToRequest(params = {}) {
    if (this.location === 'header') {
      const headers = {
        ...(params.headers || {}),
        [this.headerName]: this.key
      };
      
      return {
        ...params,
        headers
      };
    } else if (this.location === 'query') {
      const url = new URL(params.url || '');
      url.searchParams.append(this.paramName, this.key);
      
      return {
        ...params,
        url: url.toString()
      };
    }
    
    return params;
  }
}

/**
 * OAuth2 authentication manager
 */
export class OAuth2Manager {
  /**
   * Create an OAuth2 authentication manager
   * @param {Object} config - Authentication configuration
   * @param {string} config.tokenUrl - Token URL
   * @param {string} config.clientId - Client ID
   * @param {string} [config.clientSecret] - Client secret
   * @param {string} [config.scope] - Scope
   * @param {string} [config.grantType='client_credentials'] - Grant type
   */
  constructor(config) {
    this.tokenUrl = config.tokenUrl;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.scope = config.scope;
    this.grantType = config.grantType || 'client_credentials';
    this.token = null;
    this.expiresAt = null;
  }
  
  /**
   * Check if authenticated
   * @returns {boolean} True if authenticated
   */
  isAuthenticated() {
    return !!this.token && this.expiresAt > Date.now();
  }
  
  /**
   * Get token
   * @returns {string} Token
   */
  getToken() {
    if (!this.isAuthenticated()) {
      this.fetchToken();
    }
    return this.token;
  }
  
  /**
   * Set token
   * @param {string} token - Token
   * @param {number} [expiresIn=3600] - Expiration time in seconds
   */
  setToken(token, expiresIn = 3600) {
    this.token = token;
    this.expiresAt = Date.now() + (expiresIn * 1000);
  }
  
  /**
   * Clear token
   */
  clearToken() {
    this.token = null;
    this.expiresAt = null;
  }
  
  /**
   * Fetch token from endpoint
   * @returns {string} Token
   */
  fetchToken() {
    const payload = {
      grant_type: this.grantType,
      client_id: this.clientId
    };
    
    if (this.clientSecret) {
      payload.client_secret = this.clientSecret;
    }
    
    if (this.scope) {
      payload.scope = this.scope;
    }
    
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    
    const response = http.post(this.tokenUrl, payload, { headers });
    
    check(response, {
      'Token request successful': (r) => r.status === 200
    });
    
    if (response.status === 200) {
      try {
        const data = JSON.parse(response.body);
        this.token = data.access_token;
        this.expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
        return this.token;
      } catch (e) {
        throw new Error(`Failed to parse token response: ${e.message}`);
      }
    } else {
      throw new Error(`Failed to fetch token: ${response.status} ${response.body}`);
    }
  }
  
  /**
   * Apply OAuth2 token to request params
   * @param {Object} params - Request parameters
   * @returns {Object} Updated request parameters
   */
  applyToRequest(params = {}) {
    const token = this.getToken();
    if (!token) {
      return params;
    }
    
    const headers = {
      ...(params.headers || {}),
      'Authorization': `Bearer ${token}`
    };
    
    return {
      ...params,
      headers
    };
  }
}