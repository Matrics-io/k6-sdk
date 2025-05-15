/**
 * HTTP request/response logging for k6 performance testing SDK
 */

import { getEnvVar } from '../config/env.js';

// Log levels
const LOG_LEVELS = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5
};

// Get log level from environment
const logLevelName = getEnvVar('LOG_LEVEL', 'INFO').toUpperCase();
const LOG_LEVEL = LOG_LEVELS[logLevelName] || LOG_LEVELS.INFO;

/**
 * Log HTTP request details
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {Object} headers - Request headers
 * @param {*} body - Request body
 */
export function logRequest(method, url, headers, body) {
  if (LOG_LEVEL >= LOG_LEVELS.DEBUG) {
    console.log(`➡️ ${method} ${url}`);
    
    if (LOG_LEVEL >= LOG_LEVELS.TRACE) {
      console.log('Request Headers:', JSON.stringify(headers, null, 2));
      
      if (body) {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
        console.log('Request Body:', bodyStr.length > 1000 ? bodyStr.substring(0, 1000) + '...' : bodyStr);
      }
    }
  }
}

/**
 * Log HTTP response details
 * @param {Object} response - k6 HTTP response object
 */
export function logResponse(response) {
  const { status, url, timings } = response;
  
  // Always log errors
  if (status >= 400) {
    console.error(`❌ ${status} ${url} (${timings.duration.toFixed(2)}ms)`);
    
    if (LOG_LEVEL >= LOG_LEVELS.ERROR) {
      console.error('Response Body:', response.body.length > 1000 ? response.body.substring(0, 1000) + '...' : response.body);
    }
    return;
  }
  
  // Log successful responses based on log level
  if (LOG_LEVEL >= LOG_LEVELS.DEBUG) {
    console.log(`✅ ${status} ${url} (${timings.duration.toFixed(2)}ms)`);
    
    if (LOG_LEVEL >= LOG_LEVELS.TRACE) {
      console.log('Response Headers:', JSON.stringify(response.headers, null, 2));
      console.log('Response Body:', response.body.length > 1000 ? response.body.substring(0, 1000) + '...' : response.body);
    }
  }
}

/**
 * Set the current log level
 * @param {string|number} level - Log level name or number
 */
export function setLogLevel(level) {
  if (typeof level === 'string') {
    const levelName = level.toUpperCase();
    if (LOG_LEVELS[levelName] !== undefined) {
      LOG_LEVEL = LOG_LEVELS[levelName];
    }
  } else if (typeof level === 'number') {
    LOG_LEVEL = level;
  }
}

// Export log levels and current level
export const logLevels = LOG_LEVELS;
export const currentLogLevel = LOG_LEVEL;
