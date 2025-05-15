/**
 * Utility helpers for k6 performance testing SDK
 */

import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { sleep } from 'k6';

/**
 * Generate a random UUID v4
 * @returns {string} Random UUID
 */
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a random email address
 * @param {string} [domain='example.com'] - Email domain
 * @returns {string} Random email address
 */
export function randomEmail(domain = 'example.com') {
  return `user_${randomString(8)}@${domain}`;
}

/**
 * Generate a random username
 * @param {number} [length=8] - Username length
 * @returns {string} Random username
 */
export function randomUsername(length = 8) {
  return `user_${randomString(length)}`;
}

/**
 * Generate a random password
 * @param {number} [length=12] - Password length
 * @param {boolean} [includeSpecial=true] - Include special characters
 * @returns {string} Random password
 */
export function randomPassword(length = 12, includeSpecial = true) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const specialChars = '!@#$%^&*()_+~`|}{[]:;?><,./-=';
  
  let password = '';
  const charSet = includeSpecial ? chars + specialChars : chars;
  
  for (let i = 0; i < length; i++) {
    password += charSet.charAt(Math.floor(Math.random() * charSet.length));
  }
  
  return password;
}

/**
 * Generate a random date between two dates
 * @param {Date|string} [start=new Date(2000, 0, 1)] - Start date
 * @param {Date|string} [end=new Date()] - End date
 * @returns {Date} Random date
 */
export function randomDate(start = new Date(2000, 0, 1), end = new Date()) {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  
  return new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
}

/**
 * Format a date as ISO string
 * @param {Date} [date=new Date()] - Date to format
 * @returns {string} Formatted date
 */
export function formatDate(date = new Date()) {
  return date.toISOString();
}

/**
 * Generate a random item from an array
 * @param {Array} array - Array to pick from
 * @returns {*} Random item
 */
export function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate a random number between min and max
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random number
 */
export function randomNumber(min, max) {
  return randomIntBetween(min, max);
}

/**
 * Generate a random boolean
 * @param {number} [trueProbability=0.5] - Probability of returning true (0-1)
 * @returns {boolean} Random boolean
 */
export function randomBoolean(trueProbability = 0.5) {
  return Math.random() < trueProbability;
}

/**
 * Pause execution for a random duration
 * @param {number} min - Minimum duration in seconds
 * @param {number} max - Maximum duration in seconds
 */
export function randomSleep(min, max) {
  sleep(randomNumber(min, max));
}

/**
 * Generate a random IP address
 * @returns {string} Random IP address
 */
export function randomIp() {
  return `${randomIntBetween(1, 255)}.${randomIntBetween(0, 255)}.${randomIntBetween(0, 255)}.${randomIntBetween(0, 255)}`;
}

/**
 * Generate a random user agent string
 * @returns {string} Random user agent
 */
export function randomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
  ];
  
  return randomItem(userAgents);
}

/**
 * Generate a random HTTP method
 * @param {boolean} [includeAll=false] - Include all HTTP methods or just common ones
 * @returns {string} Random HTTP method
 */
export function randomHttpMethod(includeAll = false) {
  const commonMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  const allMethods = [...commonMethods, 'HEAD', 'OPTIONS', 'PATCH'];
  
  return randomItem(includeAll ? allMethods : commonMethods);
}

/**
 * Generate a random content type
 * @returns {string} Random content type
 */
export function randomContentType() {
  const contentTypes = [
    'application/json',
    'application/xml',
    'text/plain',
    'text/html',
    'application/x-www-form-urlencoded',
    'multipart/form-data'
  ];
  
  return randomItem(contentTypes);
}

/**
 * Generate a random JSON object with specified fields
 * @param {Object} schema - Schema defining field types
 * @returns {Object} Random JSON object
 * 
 * Example:
 * randomJson({
 *   id: 'uuid',
 *   name: 'string',
 *   age: 'number',
 *   email: 'email',
 *   active: 'boolean'
 * })
 */
export function randomJson(schema) {
  const result = {};
  
  for (const [key, type] of Object.entries(schema)) {
    switch (type) {
      case 'uuid':
        result[key] = uuid();
        break;
      case 'string':
        result[key] = randomString(10);
        break;
      case 'number':
        result[key] = randomNumber(1, 100);
        break;
      case 'email':
        result[key] = randomEmail();
        break;
      case 'boolean':
        result[key] = randomBoolean();
        break;
      case 'date':
        result[key] = formatDate(randomDate());
        break;
      case 'ip':
        result[key] = randomIp();
        break;
      default:
        result[key] = null;
    }
  }
  
  return result;
}
