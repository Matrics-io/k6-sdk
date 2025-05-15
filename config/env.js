/**
 * Environment variable handling for k6 performance testing SDK
 * Supports both k6's __ENV and Node.js process.env
 */

// Determine if running in k6 environment
const isK6Env = typeof __ENV !== 'undefined';

/**
 * Get environment variable value
 * @param {string} key - Environment variable name
 * @param {*} defaultValue - Default value if not found
 * @returns {string} Environment variable value or default
 */
export function getEnvVar(key, defaultValue = '') {
  if (isK6Env) {
    return __ENV[key] !== undefined ? __ENV[key] : defaultValue;
  } else if (typeof process !== 'undefined' && process.env) {
    return process.env[key] !== undefined ? process.env[key] : defaultValue;
  }
  return defaultValue;
}

/**
 * Get environment variable, throwing error if not found
 * @param {string} key - Environment variable name
 * @returns {string} Environment variable value
 * @throws {Error} If environment variable is not set
 */
export function requireEnvVar(key) {
  const value = getEnvVar(key);
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Get all environment variables with a specific prefix
 * @param {string} prefix - Prefix to filter environment variables
 * @returns {Object} Object with environment variables
 */
export function getEnvVars(prefix = '') {
  const vars = {};
  
  if (isK6Env) {
    Object.keys(__ENV).forEach(key => {
      if (!prefix || key.startsWith(prefix)) {
        vars[key] = __ENV[key];
      }
    });
  } else if (typeof process !== 'undefined' && process.env) {
    Object.keys(process.env).forEach(key => {
      if (!prefix || key.startsWith(prefix)) {
        vars[key] = process.env[key];
      }
    });
  }
  
  return vars;
}
