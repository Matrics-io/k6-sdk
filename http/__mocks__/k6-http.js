/**
 * Mock for k6/http - performs real HTTP requests via fetch() and returns k6-shaped response.
 * Used when running HTTP client integration tests in Node against a mock server.
 */

function headersToObject(headers) {
  if (!headers || typeof headers.entries !== 'function') return {};
  const out = {};
  for (const [k, v] of headers.entries()) out[k] = v;
  return out;
}

/**
 * Build k6-style response from fetch Response and timing.
 * @param {string} url - Request URL
 * @param {Response} res - fetch Response
 * @param {string} bodyText - Response body text
 * @param {number} durationMs - Request duration in ms
 */
function toK6Response(url, res, bodyText, durationMs) {
  const timings = {
    duration: durationMs,
    blocked: 0,
    connecting: 0,
    tls_handshaking: 0,
    sending: 0,
    waiting: durationMs,
    receiving: 0
  };
  return {
    status: res.status,
    status_code: res.status,
    body: bodyText ?? '',
    headers: headersToObject(res.headers),
    url,
    timings
  };
}

async function request(method, url, body, params = {}) {
  const start = Date.now();
  const headers = params.headers ?? {};
  const timeoutMs = typeof params.timeout === 'string'
    ? parseTimeout(params.timeout)
    : (params.timeout ?? 30000);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const options = {
      method,
      headers,
      signal: controller.signal
    };
    if (body != null && method !== 'GET' && method !== 'HEAD') {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
      if (typeof body === 'object' && !headers['Content-Type']) {
        options.headers = { ...headers, 'Content-Type': 'application/json' };
      }
    }
    const res = await fetch(url, options);
    const bodyText = await res.text();
    const durationMs = Date.now() - start;
    return toK6Response(url, res, bodyText, durationMs);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseTimeout(s) {
  const match = /^(\d+)(s|m|ms)?$/i.exec(String(s).trim());
  if (!match) return 30000;
  const n = parseInt(match[1], 10);
  const unit = (match[2] || 'ms').toLowerCase();
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return n;
}

export function get(url, params) {
  return request('GET', url, null, params);
}

export function post(url, body, params) {
  return request('POST', url, body, params);
}

export function put(url, body, params) {
  return request('PUT', url, body, params);
}

export function patch(url, body, params) {
  return request('PATCH', url, body, params);
}

export function del(url, body, params) {
  return request('DELETE', url, body, params);
}

export function head(url, params) {
  return request('HEAD', url, null, params);
}

export function options(url, params) {
  return request('OPTIONS', url, null, params);
}

export default { get, post, put, patch, del, head, options };
