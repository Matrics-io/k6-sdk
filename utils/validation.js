/**
 * Input validation helpers for the k6 performance testing SDK
 */

/**
 * Validates if a value is a non-empty string
 * @param {*} value - Value to validate
 * @param {string} [name='Value'] - Name of the value for error message
 * @throws {Error} If validation fails
 */
export function validateString(value, name = 'Value') {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${name} must be a non-empty string`);
    }
  }
  
  /**
   * Validates if a value is a positive number
   * @param {*} value - Value to validate
   * @param {string} [name='Value'] - Name of the value for error message
   * @throws {Error} If validation fails
   */
  export function validatePositiveNumber(value, name = 'Value') {
    if (typeof value !== 'number' || isNaN(value) || value <= 0) {
      throw new Error(`${name} must be a positive number`);
    }
  }
  
  /**
   * Validates if a value is a valid URL
   * @param {string} value - URL to validate
   * @param {string} [name='URL'] - Name of the value for error message
   * @throws {Error} If validation fails
   */
  export function validateUrl(value, name = 'URL') {
    validateString(value, name);
    
    try {
      new URL(value);
    } catch (e) {
      throw new Error(`${name} must be a valid URL`);
    }
  }
  
  /**
   * Validates object has required properties
   * @param {Object} obj - Object to validate
   * @param {Array<string>} requiredProps - List of required property names
   * @param {string} [objName='Object'] - Name of the object for error message
   * @throws {Error} If validation fails
   */
  export function validateRequiredProps(obj, requiredProps, objName = 'Object') {
    if (typeof obj !== 'object' || obj === null) {
      throw new Error(`${objName} must be an object`);
    }
    
    for (const prop of requiredProps) {
      if (!(prop in obj)) {
        throw new Error(`${objName} is missing required property: ${prop}`);
      }
    }
  }
  
  /**
   * Validates test configuration object
   * @param {Object} config - Configuration to validate
   * @throws {Error} If validation fails
   */
  export function validateTestConfig(config) {
    validateRequiredProps(config, ['baseUrl', 'endpoints'], 'Test configuration');
    validateUrl(config.baseUrl, 'config.baseUrl');
    
    if (!Array.isArray(config.endpoints) && typeof config.endpoints !== 'object') {
      throw new Error('config.endpoints must be an array or object');
    }
  }
  
  /**
   * Validates HTTP request options
   * @param {Object} options - HTTP request options
   * @throws {Error} If validation fails
   */
  export function validateHttpOptions(options) {
    if (typeof options !== 'object' || options === null) {
      throw new Error('HTTP options must be an object');
    }
    
    if (options.timeout !== undefined) {
      validatePositiveNumber(options.timeout, 'options.timeout');
    }
    
    if (options.headers !== undefined && (typeof options.headers !== 'object' || options.headers === null)) {
      throw new Error('options.headers must be an object');
    }
  }
  
  /**
   * Validates k6 options
   * @param {Object} options - k6 options
   * @throws {Error} If validation fails
   */
  export function validateK6Options(options) {
    if (typeof options !== 'object' || options === null) {
      throw new Error('k6 options must be an object');
    }
    
    if (options.vus !== undefined) {
      validatePositiveNumber(options.vus, 'options.vus');
    }
    
    if (options.duration !== undefined) {
      validateString(options.duration, 'options.duration');
      if (!/^\d+[smh]$/.test(options.duration)) {
        throw new Error('options.duration must be in format like "30s", "5m", "1h"');
      }
    }
    
    if (options.iterations !== undefined) {
      validatePositiveNumber(options.iterations, 'options.iterations');
    }
  }
  
  /**
   * Validates threshold configuration
   * @param {Object} thresholds - Threshold configuration
   * @throws {Error} If validation fails
   */
  export function validateThresholds(thresholds) {
    if (typeof thresholds !== 'object' || thresholds === null) {
      throw new Error('Thresholds must be an object');
    }
    
    for (const [key, value] of Object.entries(thresholds)) {
      if (!Array.isArray(value)) {
        throw new Error(`Threshold for ${key} must be an array of threshold expressions`);
      }
      
      for (const expr of value) {
        validateString(expr, `Threshold expression for ${key}`);
      }
    }
  }
  
  /**
   * Validates authentication configuration
   * @param {Object} authConfig - Authentication configuration
   * @throws {Error} If validation fails
   */
  export function validateAuthConfig(authConfig) {
    validateRequiredProps(authConfig, ['type'], 'Authentication configuration');
    validateString(authConfig.type, 'authConfig.type');
    
    switch (authConfig.type.toLowerCase()) {
      case 'basic':
        validateRequiredProps(authConfig, ['username', 'password'], 'Basic auth configuration');
        validateString(authConfig.username, 'authConfig.username');
        validateString(authConfig.password, 'authConfig.password');
        break;
      case 'bearer':
        validateRequiredProps(authConfig, ['token'], 'Bearer auth configuration');
        validateString(authConfig.token, 'authConfig.token');
        break;
      case 'oauth':
        validateRequiredProps(authConfig, ['tokenUrl'], 'OAuth auth configuration');
        validateUrl(authConfig.tokenUrl, 'authConfig.tokenUrl');
        break;
      default:
        throw new Error(`Unsupported authentication type: ${authConfig.type}`);
    }
  }