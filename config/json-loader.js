/**
 * JSON configuration file loader for k6 performance testing SDK
 */

import { open } from 'k6/experimental/fs';
import { getEnvVar } from './env.js';

/**
 * Load JSON configuration from file
 * @param {string} path - Path to JSON configuration file
 * @returns {Object} Parsed configuration object
 */
export function loadJsonConfig(path) {
  try {
    const file = open(path);
    const content = file.toString();
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Failed to load config from ${path}: ${error.message}`);
    return {};
  }
}

/**
 * Merge multiple configuration objects
 * @param {Object} target - Target object to merge into
 * @param {...Object} sources - Source objects to merge from
 * @returns {Object} Merged configuration object
 */
export function mergeConfigs(target, ...sources) {
  if (!sources.length) return target;
  
  const source = sources.shift();
  
  if (source === undefined) return target;
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeConfigs(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    });
  }
  
  return mergeConfigs(target, ...sources);
}

/**
 * Resolve configuration value with environment variable override
 * @param {*} value - Configuration value
 * @param {string} path - Configuration path (for env var lookup)
 * @returns {*} Resolved configuration value
 */
export function resolveConfigValue(value, path) {
  // If value is an object, recursively resolve all properties
  if (isObject(value) && !Array.isArray(value)) {
    const resolved = {};
    Object.keys(value).forEach(key => {
      resolved[key] = resolveConfigValue(value[key], `${path}_${key.toUpperCase()}`);
    });
    return resolved;
  }
  
  // Check for environment variable override
  const envValue = getEnvVar(path);
  if (envValue) {
    // Try to parse as JSON if it looks like an object or array
    if (envValue.startsWith('{') || envValue.startsWith('[')) {
      try {
        return JSON.parse(envValue);
      } catch (e) {
        // If parsing fails, use as string
        return envValue;
      }
    }
    
    // Convert to appropriate type
    if (envValue === 'true') return true;
    if (envValue === 'false') return false;
    if (!isNaN(envValue)) return Number(envValue);
    
    return envValue;
  }
  
  return value;
}

/**
 * Check if value is an object
 * @private
 * @param {*} item - Value to check
 * @returns {boolean} True if value is an object
 */
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}
