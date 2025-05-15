/**
 * HTTP utilities for k6 performance testing SDK
 */

import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Enhanced HTTP client with additional features
 */
export class HttpClient {
  /**
   * Create an HTTP client
   * @param {Object} config - Client configuration
   * @param {string} config.baseUrl - Base URL
   * @param {Object} [config.headers={}] - Default headers
   * @param {Object} [config.auth=null] - Authentication manager
   * @param {number} [config.timeout=30000] - Request timeout in milliseconds
   * @param {boolean} [config.validateStatus=true] - Validate response status
   */
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.headers = config.headers || {};
    this.auth = config.auth || null;
    this.timeout = config.timeout || 30000;
    this.validateStatus = config.validateStatus !== false;
  }
  
  /**
   * Build URL from path
   * @param {string} path - Path
   * @returns {string} Full URL
   */
  buildUrl(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    
    const baseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const pathWithSlash = path.startsWith('/') ? path : `/${path}`;
    
    return `${baseUrl}${pathWithSlash}`;
  }
  
  /**
   * Build request parameters
   * @param {Object} params - Request parameters
   * @returns {Object} Built parameters
   */
  buildParams(params = {}) {
    const result = {
      headers: { ...this.headers, ...(params.headers || {}) },
      timeout: params.timeout || this.timeout,
      tags: params.tags || {}
    };
    
    // Apply authentication if available
    if (this.auth) {
      const authParams = this.auth.applyToRequest(result);
      Object.assign(result, authParams);
    }
    
    return result;
  }
  
  /**
   * Validate response
   * @param {Object} response - HTTP response
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {Object} [options={}] - Validation options
   * @returns {boolean} Validation result
   */
  validateResponse(response, method, url, options = {}) {
    if (!this.validateStatus) {
      return true;
    }
    
    const checkName = options.checkName || `${method} ${url} status is 2xx`;
    const checkFn = options.checkFn || ((r) => r.status >= 200 && r.status < 300);
    
    const result = check(response, {
      [checkName]: checkFn
    });
    
    if (!result && options.failOnError) {
      fail(`Request failed: ${method} ${url} returned ${response.status}`);
    }
    
    return result;
  }
  
  /**
   * Make HTTP request
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {Object|string} [body=null] - Request body
   * @param {Object} [params={}] - Request parameters
   * @returns {Object} HTTP response
   */
  request(method, path, body = null, params = {}) {
    const url = this.buildUrl(path);
    const requestParams = this.buildParams(params);
    
    let response;
    
    if (method === 'GET' || method === 'HEAD') {
      response = http.request(method, url, null, requestParams);
    } else {
      response = http.request(method, url, body, requestParams);
    }
    
    this.validateResponse(response, method, url, params);
    
    return response;
  }
  
  /**
   * Make GET request
   * @param {string} path - Request path
   * @param {Object} [params={}] - Request parameters
   * @returns {Object} HTTP response
   */
  get(path, params = {}) {
    return this.request('GET', path, null, params);
  }
  
  /**
   * Make POST request
   * @param {string} path - Request path
   * @param {Object|string} [body=null] - Request body
   * @param {Object} [params={}] - Request parameters
   * @returns {Object} HTTP response
   */
  post(path, body = null, params = {}) {
    return this.request('POST', path, body, params);
  }
  
  /**
   * Make PUT request
   * @param {string} path - Request path
   * @param {Object|string} [body=null] - Request body
   * @param {Object} [params={}] - Request parameters
   * @returns {Object} HTTP response
   */
  put(path, body = null, params = {}) {
    return this.request('PUT', path, body, params);
  }
  
  /**
   * Make DELETE request
   * @param {string} path - Request path
   * @param {Object|string} [body=null] - Request body
   * @param {Object} [params={}] - Request parameters
   * @returns {Object} HTTP response
   */
  delete(path, body = null, params = {}) {
    return this.request('DELETE', path, body, params);
  }
  
  /**
   * Make PATCH request
   * @param {string} path - Request path
   * @param {Object|string} [body=null] - Request body
   * @param {Object} [params={}] - Request parameters
   * @returns {Object} HTTP response
   */
  patch(path, body = null, params = {}) {
    return this.request('PATCH', path, body, params);
  }
  
  /**
   * Make HEAD request
   * @param {string} path - Request path
   * @param {Object} [params={}] - Request parameters
   * @returns {Object} HTTP response
   */
  head(path, params = {}) {
    return this.request('HEAD', path, null, params);
  }
  
  /**
   * Make OPTIONS request
   * @param {string} path - Request path
   * @param {Object} [params={}] - Request parameters
   * @returns {Object} HTTP response
   */
  options(path, params = {}) {
    return this.request('OPTIONS', path, null, params);
  }
}