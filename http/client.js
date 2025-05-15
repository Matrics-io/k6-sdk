/**
 * HTTP client wrapper for k6 performance testing SDK
 */

import http from 'k6/http';
import { check, fail } from 'k6';
import { logRequest, logResponse } from './logger.js';
import { trackMetrics } from './metrics.js';

/**
 * Create an HTTP client with the specified configuration
 * @param {Object} options - HTTP client options
 * @param {string} [options.baseUrl] - Base URL for all requests
 * @param {Object} [options.defaultHeaders] - Default headers for all requests
 * @param {string} [options.token] - Authentication token
 * @param {Object} [options.tags] - Default tags for all requests
 * @returns {Object} HTTP client instance
 */
export function createHttpClient(options = {}) {
  const {
    baseUrl = '',
    defaultHeaders = {},
    token = null,
    tags = {}
  } = options;
  
  /**
   * Make an HTTP request
   * @param {string} method - HTTP method
   * @param {string} path - Request path (appended to baseUrl)
   * @param {Object|string} [data] - Request body
   * @param {Object} [params] - Additional request parameters
   * @returns {Object} k6 HTTP response
   */
  function request(method, path, data = null, params = {}) {
    // Build full URL
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
    
    // Merge headers
    const headers = {
      ...defaultHeaders,
      ...params.headers
    };
    
    // Add auth token if available
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Merge tags
    const requestTags = {
      ...tags,
      ...params.tags,
      url,
      method
    };
    
    // Prepare request params
    const requestParams = {
      headers,
      tags: requestTags,
      timeout: params.timeout || '30s',
      ...params
    };
    
    // Log request
    logRequest(method, url, headers, data);
    
    // Make request
    let response;
    try {
      // Handle different HTTP methods
      if (method === 'GET') {
        response = http.get(url, requestParams);
      } else if (method === 'POST') {
        response = http.post(url, data, requestParams);
      } else if (method === 'PUT') {
        response = http.put(url, data, requestParams);
      } else if (method === 'PATCH') {
        response = http.patch(url, data, requestParams);
      } else if (method === 'DELETE') {
        response = http.del(url, data, requestParams);
      } else if (method === 'HEAD') {
        response = http.head(url, requestParams);
      } else if (method === 'OPTIONS') {
        response = http.options(url, requestParams);
      } else {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }
    } catch (error) {
      fail(`Request failed: ${error.message}`);
      throw error;
    }
    
    // Log response
    logResponse(response);
    
    // Track metrics
    trackMetrics(response, requestTags);
    
    // Return response
    return response;
  }
  
  // Return HTTP client interface
  return {
    request,
    get: (path, params) => request('GET', path, null, params),
    post: (path, data, params) => request('POST', path, data, params),
    put: (path, data, params) => request('PUT', path, data, params),
    patch: (path, data, params) => request('PATCH', path, data, params),
    delete: (path, params) => request('DELETE', path, null, params),
    head: (path, params) => request('HEAD', path, null, params),
    options: (path, params) => request('OPTIONS', path, null, params),
    
    // Set authentication token
    setToken: (newToken) => {
      token = newToken;
    },
    
    // Add default headers
    addDefaultHeaders: (headers) => {
      Object.assign(defaultHeaders, headers);
    },
    
    // Get current configuration
    getConfig: () => ({
      baseUrl,
      defaultHeaders: { ...defaultHeaders },
      token,
      tags: { ...tags }
    })
  };
}

// Export a factory function
export default {
  create: createHttpClient
};
