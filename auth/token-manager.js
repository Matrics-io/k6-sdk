/**
 * Token management for k6 performance testing SDK
 */

import { sleep } from 'k6';

/**
 * TokenManager class for handling authentication tokens
 */
export class TokenManager {
  /**
   * Create a new TokenManager
   * @param {Object} options - Token manager options
   * @param {Function} options.loginFn - Function to obtain a new token
   * @param {number} [options.expiryBuffer=60] - Buffer time in seconds before token expiry
   * @param {number} [options.retryDelay=5] - Delay in seconds between retry attempts
   * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
   */
  constructor(options) {
    this.loginFn = options.loginFn;
    this.expiryBuffer = options.expiryBuffer || 60;
    this.retryDelay = options.retryDelay || 5;
    this.maxRetries = options.maxRetries || 3;
    
    this.token = null;
    this.expiresAt = null;
    this.refreshing = false;
  }
  
  /**
   * Get a valid token, refreshing if necessary
   * @returns {Promise<string>} Valid authentication token
   */
  async getToken() {
    // If token is valid, return it
    if (this.isTokenValid()) {
      return this.token;
    }
    
    // If token is being refreshed, wait for it
    if (this.refreshing) {
      return this._waitForRefresh();
    }
    
    // Otherwise, refresh the token
    return this.refreshToken();
  }
  
  /**
   * Check if the current token is valid
   * @returns {boolean} True if token is valid
   */
  isTokenValid() {
    if (!this.token || !this.expiresAt) {
      return false;
    }
    
    // Check if token is about to expire (with buffer)
    const now = Date.now() / 1000;
    return now < (this.expiresAt - this.expiryBuffer);
  }
  
  /**
   * Refresh the authentication token
   * @returns {Promise<string>} New authentication token
   */
  async refreshToken() {
    this.refreshing = true;
    
    let retries = 0;
    let error = null;
    
    while (retries <= this.maxRetries) {
      try {
        const result = await this.loginFn();
        
        // Update token and expiry
        this.token = result.token;
        this.expiresAt = result.expiresAt;
        
        this.refreshing = false;
        return this.token;
      } catch (err) {
        error = err;
        retries++;
        
        if (retries <= this.maxRetries) {
          console.warn(`Token refresh failed, retrying (${retries}/${this.maxRetries}): ${err.message}`);
          sleep(this.retryDelay);
        }
      }
    }
    
    this.refreshing = false;
    throw new Error(`Failed to refresh token after ${this.maxRetries} attempts: ${error.message}`);
  }
  
  /**
   * Set token manually
   * @param {string} token - Authentication token
   * @param {number} expiresAt - Token expiry timestamp (in seconds)
   */
  setToken(token, expiresAt) {
    this.token = token;
    this.expiresAt = expiresAt;
  }
  
  /**
   * Clear the current token
   */
  clearToken() {
    this.token = null;
    this.expiresAt = null;
  }
  
  /**
   * Wait for token refresh to complete
   * @private
   * @returns {Promise<string>} Authentication token
   */
  async _waitForRefresh() {
    let attempts = 0;
    const maxAttempts = 10;
    
    while (this.refreshing && attempts < maxAttempts) {
      sleep(0.5);
      attempts++;
    }
    
    if (this.refreshing) {
      throw new Error('Timed out waiting for token refresh');
    }
    
    return this.token;
  }
}

/**
 * Create a new TokenManager
 * @param {Object} options - Token manager options
 * @returns {TokenManager} Token manager instance
 */
export function createTokenManager(options) {
  return new TokenManager(options);
}

export default {
  create: createTokenManager
};
