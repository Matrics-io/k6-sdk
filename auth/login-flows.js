/**
 * Common authentication flows for k6 performance testing SDK
 */

import { parseHTML } from 'k6/html';
import { check } from 'k6';

/**
 * Basic username/password authentication
 * @param {Object} http - HTTP client instance
 * @param {Object} options - Authentication options
 * @param {string} options.url - Authentication endpoint URL
 * @param {string} options.username - Username
 * @param {string} options.password - Password
 * @param {Object} [options.extraParams] - Additional parameters to include in request
 * @returns {Promise<Object>} Authentication result with token and expiry
 */
export async function basicAuth(http, options) {
  const { url, username, password, extraParams = {} } = options;
  
  const payload = {
    username,
    password,
    ...extraParams
  };
  
  const response = http.post(url, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  const success = check(response, {
    'Authentication successful': (r) => r.status === 200,
    'Token received': (r) => r.json('token') !== undefined
  });
  
  if (!success) {
    throw new Error(`Authentication failed: ${response.status} ${response.body}`);
  }
  
  const json = response.json();
  
  return {
    token: json.token,
    expiresAt: calculateExpiry(json),
    refreshToken: json.refresh_token,
    user: json.user
  };
}

/**
 * OAuth2 client credentials flow
 * @param {Object} http - HTTP client instance
 * @param {Object} options - Authentication options
 * @param {string} options.url - Token endpoint URL
 * @param {string} options.clientId - OAuth client ID
 * @param {string} options.clientSecret - OAuth client secret
 * @param {string} [options.scope] - OAuth scope
 * @returns {Promise<Object>} Authentication result with token and expiry
 */
export async function oauth2ClientCredentials(http, options) {
  const { url, clientId, clientSecret, scope = '' } = options;
  
  const payload = {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope
  };
  
  const formData = Object.entries(payload)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  
  const response = http.post(url, formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  const success = check(response, {
    'Authentication successful': (r) => r.status === 200,
    'Access token received': (r) => r.json('access_token') !== undefined
  });
  
  if (!success) {
    throw new Error(`OAuth authentication failed: ${response.status} ${response.body}`);
  }
  
  const json = response.json();
  
  return {
    token: json.access_token,
    expiresAt: calculateExpiry(json),
    refreshToken: json.refresh_token,
    tokenType: json.token_type,
    scope: json.scope
  };
}

/**
 * OAuth2 password flow
 * @param {Object} http - HTTP client instance
 * @param {Object} options - Authentication options
 * @param {string} options.url - Token endpoint URL
 * @param {string} options.clientId - OAuth client ID
 * @param {string} options.username - Username
 * @param {string} options.password - Password
 * @param {string} [options.scope] - OAuth scope
 * @returns {Promise<Object>} Authentication result with token and expiry
 */
export async function oauth2Password(http, options) {
  const { url, clientId, username, password, scope = '' } = options;
  
  const payload = {
    grant_type: 'password',
    client_id: clientId,
    username,
    password,
    scope
  };
  
  // Add client_secret if provided
  if (options.clientSecret) {
    payload.client_secret = options.clientSecret;
  }
  
  const formData = Object.entries(payload)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  
  const response = http.post(url, formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  const success = check(response, {
    'Authentication successful': (r) => r.status === 200,
    'Access token received': (r) => r.json('access_token') !== undefined
  });
  
  if (!success) {
    throw new Error(`OAuth authentication failed: ${response.status} ${response.body}`);
  }
  
  const json = response.json();
  
  return {
    token: json.access_token,
    expiresAt: calculateExpiry(json),
    refreshToken: json.refresh_token,
    tokenType: json.token_type,
    scope: json.scope
  };
}

/**
 * Form-based login flow (for websites)
 * @param {Object} http - HTTP client instance
 * @param {Object} options - Authentication options
 * @param {string} options.loginPageUrl - Login page URL
 * @param {string} options.formActionUrl - Form submission URL
 * @param {string} options.usernameField - Username field name
 * @param {string} options.passwordField - Password field name
 * @param {string} options.username - Username
 * @param {string} options.password - Password
 * @param {Function} [options.extractToken] - Function to extract token from response
 * @returns {Promise<Object>} Authentication result
 */
export async function formLogin(http, options) {
  const {
    loginPageUrl,
    formActionUrl,
    usernameField,
    passwordField,
    username,
    password,
    extractToken = defaultExtractToken
  } = options;
  
  // Get the login page to extract any CSRF tokens
  const loginPageResponse = http.get(loginPageUrl);
  
  // Parse the HTML
  const doc = parseHTML(loginPageResponse.body);
  
  // Extract CSRF token if present
  const csrfToken = doc.find('input[name="csrf_token"]').val() ||
                   doc.find('input[name="_csrf"]').val() ||
                   doc.find('meta[name="csrf-token"]').attr('content');
  
  // Prepare form data
  const formData = {};
  formData[usernameField] = username;
  formData[passwordField] = password;
  
  // Add CSRF token if found
  if (csrfToken) {
    formData.csrf_token = csrfToken;
  }
  
  // Submit the form
  const loginResponse = http.post(formActionUrl, formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': loginPageUrl
    }
  });
  
  // Check if login was successful
  const success = check(loginResponse, {
    'Login successful': (r) => r.status === 200 || r.status === 302
  });
  
  if (!success) {
    throw new Error(`Form login failed: ${loginResponse.status} ${loginResponse.body}`);
  }
  
  // Extract token from response
  return extractToken(loginResponse);
}

/**
 * Calculate token expiry timestamp
 * @private
 * @param {Object} authResponse - Authentication response
 * @returns {number} Expiry timestamp in seconds
 */
function calculateExpiry(authResponse) {
  const now = Date.now() / 1000;
  
  // If expires_in is provided, use it
  if (authResponse.expires_in) {
    return now + Number(authResponse.expires_in);
  }
  
  // If exp is provided, use it
  if (authResponse.exp) {
    return Number(authResponse.exp);
  }
  
  // Default to 1 hour
  return now + 3600;
}

/**
 * Default function to extract token from response
 * @private
 * @param {Object} response - HTTP response
 * @returns {Object} Authentication result
 */
function defaultExtractToken(response) {
  // Try to parse as JSON first
  try {
    const json = response.json();
    if (json.token || json.access_token) {
      return {
        token: json.token || json.access_token,
        expiresAt: calculateExpiry(json),
        refreshToken: json.refresh_token
      };
    }
  } catch (e) {
    // Not JSON, continue
  }
  
  // Check for token in cookies
  const cookies = response.cookies;
  for (const name in cookies) {
    if (name.toLowerCase().includes('token') || name.toLowerCase().includes('auth')) {
      return {
        token: cookies[name][0].value,
        expiresAt: cookies[name][0].expires || (Date.now() / 1000 + 3600)
      };
    }
  }
  
  // If no token found, return a default object
  return {
    token: null,
    expiresAt: null
  };
}
