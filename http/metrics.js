// http/metrics.js
// HTTP metrics tracking for k6 performance testing SDK

import { Trend, Rate, Counter } from 'k6/metrics';

/**
 * Creates and initializes HTTP metrics for tracking performance
 */
export function createHttpMetrics(namespace = '') {
  const prefix = namespace ? `${namespace}_` : '';
  
  return {
    // Response time trends for different response codes
    responseTime: new Trend(`${prefix}http_response_time`),
    responseTime2xx: new Trend(`${prefix}http_response_time_2xx`),
    responseTime4xx: new Trend(`${prefix}http_response_time_4xx`),
    responseTime5xx: new Trend(`${prefix}http_response_time_5xx`),
    
    // Error rates
    errorRate: new Rate(`${prefix}http_errors`),
    clientErrorRate: new Rate(`${prefix}http_client_errors`),
    serverErrorRate: new Rate(`${prefix}http_server_errors`),
    
    // Counters for different response types
    requests: new Counter(`${prefix}http_requests`),
    responses: {
      total: new Counter(`${prefix}http_responses`),
      ok: new Counter(`${prefix}http_responses_2xx`),
      clientErrors: new Counter(`${prefix}http_responses_4xx`),
      serverErrors: new Counter(`${prefix}http_responses_5xx`)
    }
  };
}

/**
 * Records metrics for an HTTP response
 * @param {Object} metrics - Metrics object created by createHttpMetrics
 * @param {Object} response - k6 HTTP response object
 * @param {string} [name=''] - Optional name/tag for this request
 */
export function recordHttpMetrics(metrics, response, name = '') {
  const responseTime = response.timings.duration;
  const statusCode = response.status;
  const tags = name ? { name } : {};
  
  // Record response time
  metrics.responseTime.add(responseTime, tags);
  
  // Track requests and responses
  metrics.requests.add(1, tags);
  metrics.responses.total.add(1, tags);
  
  // Track response by status code category
  if (statusCode >= 200 && statusCode < 300) {
    metrics.responseTime2xx.add(responseTime, tags);
    metrics.responses.ok.add(1, tags);
    metrics.errorRate.add(0, tags);
  } else if (statusCode >= 400 && statusCode < 500) {
    metrics.responseTime4xx.add(responseTime, tags);
    metrics.responses.clientErrors.add(1, tags);
    metrics.clientErrorRate.add(1, tags);
    metrics.errorRate.add(1, tags);
  } else if (statusCode >= 500) {
    metrics.responseTime5xx.add(responseTime, tags);
    metrics.responses.serverErrors.add(1, tags);
    metrics.serverErrorRate.add(1, tags);
    metrics.errorRate.add(1, tags);
  }
  
  return { responseTime, statusCode };
}

/**
 * Creates a custom metric for tracking specific API endpoints
 * @param {string} name - Name of the endpoint to track
 * @returns {Object} Object containing trend and rate metrics
 */
export function createEndpointMetric(name) {
  return {
    responseTime: new Trend(`endpoint_${name}_response_time`),
    errorRate: new Rate(`endpoint_${name}_error_rate`)
  };
}

/**
 * Records metrics for a specific endpoint
 * @param {Object} metric - Endpoint metric object
 * @param {Object} response - k6 HTTP response object
 */
export function recordEndpointMetric(metric, response) {
  const responseTime = response.timings.duration;
  const isError = response.status >= 400;
  
  metric.responseTime.add(responseTime);
  metric.errorRate.add(isError ? 1 : 0);
  
  return { responseTime, isError };
}

/**
 * Custom metrics tracking for k6 performance testing SDK
 */

import { Trend, Counter, Rate } from 'k6/metrics';

// Define custom metrics
const metrics = {
  // Response time metrics
  httpReqDuration: new Trend('http_req_duration_custom', true),
  httpReqBlocked: new Trend('http_req_blocked_custom', true),
  httpReqConnecting: new Trend('http_req_connecting_custom', true),
  httpReqTLSHandshaking: new Trend('http_req_tls_handshaking_custom', true),
  httpReqSending: new Trend('http_req_sending_custom', true),
  httpReqWaiting: new Trend('http_req_waiting_custom', true),
  httpReqReceiving: new Trend('http_req_receiving_custom', true),
  
  // Response status metrics
  http2xx: new Counter('http_reqs_2xx'),
  http3xx: new Counter('http_reqs_3xx'),
  http4xx: new Counter('http_reqs_4xx'),
  http5xx: new Counter('http_reqs_5xx'),
  
  // Error rate
  httpReqFailed: new Rate('http_req_failed_custom', true),
  
  // Endpoint-specific metrics (populated dynamically)
  endpoints: {}
};

/**
 * Track metrics for an HTTP response
 * @param {Object} response - k6 HTTP response
 * @param {Object} tags - Tags to apply to metrics
 */
export function trackMetrics(response, tags = {}) {
  const { status, timings, url } = response;
  const endpoint = tags.endpoint || extractEndpoint(url);
  
  // Track response time metrics
  metrics.httpReqDuration.add(timings.duration, tags);
  metrics.httpReqBlocked.add(timings.blocked, tags);
  metrics.httpReqConnecting.add(timings.connecting, tags);
  metrics.httpReqTLSHandshaking.add(timings.tls_handshaking, tags);
  metrics.httpReqSending.add(timings.sending, tags);
  metrics.httpReqWaiting.add(timings.waiting, tags);
  metrics.httpReqReceiving.add(timings.receiving, tags);
  
  // Track status code metrics
  if (status >= 200 && status < 300) {
    metrics.http2xx.add(1, tags);
  } else if (status >= 300 && status < 400) {
    metrics.http3xx.add(1, tags);
  } else if (status >= 400 && status < 500) {
    metrics.http4xx.add(1, tags);
  } else if (status >= 500) {
    metrics.http5xx.add(1, tags);
  }
  
  // Track failure rate
  metrics.httpReqFailed.add(status >= 400, tags);
  
  // Track endpoint-specific metrics
  if (endpoint) {
    // Create endpoint-specific metrics if they don't exist
    if (!metrics.endpoints[endpoint]) {
      metrics.endpoints[endpoint] = {
        duration: new Trend(`endpoint_${endpoint}_duration`, true),
        rate: new Rate(`endpoint_${endpoint}_success_rate`, true)
      };
    }
    
    // Add metrics for this endpoint
    metrics.endpoints[endpoint].duration.add(timings.duration, tags);
    metrics.endpoints[endpoint].rate.add(status < 400, tags);
  }
}

/**
 * Extract endpoint name from URL
 * @private
 * @param {string} url - Full URL
 * @returns {string} Endpoint name
 */
function extractEndpoint(url) {
  try {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    
    // Return the first path segment as the endpoint
    return pathParts.length > 0 ? pathParts[0] : 'root';
  } catch (e) {
    // If URL parsing fails, return the original URL
    return url;
  }
}

/**
 * Create a custom metric
 * @param {string} name - Metric name
 * @param {string} type - Metric type (trend, counter, gauge, rate)
 * @returns {Object} k6 metric object
 */
export function createMetric(name, type = 'trend') {
  switch (type.toLowerCase()) {
    case 'trend':
      return new Trend(name, true);
    case 'counter':
      return new Counter(name);
    case 'rate':
      return new Rate(name, true);
    default:
      throw new Error(`Unsupported metric type: ${type}`);
  }
}

// Export metrics
export { metrics };
