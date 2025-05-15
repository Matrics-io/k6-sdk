/**
 * Main configuration module for k6 performance testing SDK
 */

import { getEnvVar, getEnvVars, requireEnvVar } from './env.js';
import { loadJsonConfig, mergeConfigs, resolveConfigValue } from './json-loader.js';

// Default config paths
const DEFAULT_CONFIG_PATH = 'config/default.json';
const ENV_CONFIG_PREFIX = 'CONFIG_PATH_';

/**
 * ConfigLoader class for managing test configurations
 */
export class ConfigLoader {
  constructor(options = {}) {
    this.options = {
      defaultConfigPath: options.defaultConfigPath || DEFAULT_CONFIG_PATH,
      envPrefix: options.envPrefix || '',
      configEnvKey: options.configEnvKey || 'CONFIG_ENV',
      ...options
    };
    
    this.config = {};
    this.environment = getEnvVar(this.options.configEnvKey, 'default');
  }
  
  /**
   * Load configuration from files and environment variables
   * @param {string} [configPath] - Optional path to config file
   * @param {Object} [defaultConfig] - Optional default config object
   * @returns {Object} Loaded and merged configuration
   */
  load(configPath, defaultConfig = {}) {
    // Start with provided default config or empty object
    const defaultConfigObj = defaultConfig || {};
    
    // Load default config file if exists
    const defaultConfigFile = loadJsonConfig(this.options.defaultConfigPath);
    
    // Determine environment-specific config path
    const envConfigPath = getEnvVar(`${ENV_CONFIG_PREFIX}${this.environment.toUpperCase()}`);
    
    // Load environment-specific config if exists
    const envConfig = envConfigPath ? loadJsonConfig(envConfigPath) : {};
    
    // Load user-specified config if provided
    const userConfig = configPath ? loadJsonConfig(configPath) : {};
    
    // Get additional config paths from environment variables
    const additionalConfigPaths = [];
    const configPaths = getEnvVars('CONFIG_PATH_');
    
    Object.keys(configPaths).forEach(key => {
      if (key !== `${ENV_CONFIG_PREFIX}${this.environment.toUpperCase()}`) {
        additionalConfigPaths.push(configPaths[key]);
      }
    });
    
    // Load additional configs
    const additionalConfigs = additionalConfigPaths.map(path => loadJsonConfig(path));
    
    // Load local override if specified
    const localConfigPath = getEnvVar('LOCAL_CONFIG_PATH');
    const localConfig = localConfigPath ? loadJsonConfig(localConfigPath) : {};
    
    // Merge all configs - priority from lowest to highest:
    // 1. Default config
    // 2. Additional configs (in order provided)
    // 3. Environment-specific config
    // 4. Local override config
    // 5. Environment variables (applied during resolution)
    this.config = mergeConfigs(
      {},
      defaultConfigObj,
      defaultConfigFile,
      ...additionalConfigs,
      envConfig,
      userConfig,
      localConfig
    );
    
    // Resolve environment variable overrides
    this._resolveEnvOverrides();
    
    return this.config;
  }
  
  /**
   * Get configuration value by path
   * @param {string} path - Dot-notation path to config value
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Configuration value
   */
  get(path, defaultValue) {
    return this._getValueByPath(this.config, path, defaultValue);
  }
  
  /**
   * Resolve environment variable overrides for all config values
   * @private
   */
  _resolveEnvOverrides() {
    const keys = this._getKeysWithPrefix(this.config, '');
    
    keys.forEach(key => {
      const envKey = `${this.options.envPrefix}${key.toUpperCase().replace(/\./g, '_')}`;
      const value = this._getValueByPath(this.config, key);
      const resolvedValue = resolveConfigValue(value, envKey);
      
      if (value !== resolvedValue) {
        this._setValueByPath(this.config, key, resolvedValue);
      }
    });
  }
  
  /**
   * Get value from object by dot-notation path
   * @private
   */
  _getValueByPath(obj, path, defaultValue) {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue;
      }
      current = current[part];
    }
    
    return current !== undefined ? current : defaultValue;
  }
  
  /**
   * Set value in object by dot-notation path
   * @private
   */
  _setValueByPath(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }
  
  /**
   * Helper to get all keys with a specific prefix
   * @private
   */
  _getKeysWithPrefix(obj, prefix, currentPath = '') {
    let keys = [];
    
    for (const key in obj) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        keys = keys.concat(this._getKeysWithPrefix(obj[key], prefix, newPath));
      } else if (!prefix || newPath.startsWith(prefix)) {
        keys.push(newPath);
      }
    }
    
    return keys;
  }
}

// Create and export a singleton instance for easy use
export const config = new ConfigLoader();

// Export individual functions from submodules for convenience
export { getEnvVar, requireEnvVar, getEnvVars } from './env.js';
export { loadJsonConfig, mergeConfigs } from './json-loader.js';

// Default export
export default {
  load: (path, defaultConfig) => config.load(path, defaultConfig),
  get: (path, defaultValue) => config.get(path, defaultValue),
  ConfigLoader
};
