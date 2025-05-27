/**
 * Reporting Service Output Adapter for k6 performance testing SDK
 * 
 * Transforms k6 JSON results into PerfRunDTO format and sends to central Reporting API
 * with exponential back-off retry logic (1s, 2s, 4s, max 3 attempts).
 */

import http from 'k6/http';
import { sleep } from 'k6';

/**
 * PerfRunDTO structure for reporting
 * @typedef {Object} PerfRunDTO
 * @property {number} vu - Virtual Users (peak concurrent users)
 * @property {number} rps - Requests Per Second (average throughput)  
 * @property {number} passRate - Pass rate percentage (0-100)
 * @property {number} p95 - 95th percentile response time in milliseconds
 * @property {string} testName - Name/identifier of the test
 * @property {string} timestamp - ISO timestamp of test completion
 * @property {string} environment - Test environment (dev, staging, prod)
 * @property {number} duration - Test duration in seconds
 * @property {Object} metadata - Additional test metadata
 */

/**
 * ReportingAdapter class for sending k6 results to central reporting API
 */
export class ReportingAdapter {
  /**
   * Create a reporting adapter
   * @param {Object} config - Adapter configuration
   * @param {string} config.apiUrl - Reporting API base URL
   * @param {string} config.apiKey - API key for authentication
   * @param {string} [config.environment='test'] - Test environment
   * @param {number} [config.maxRetries=3] - Maximum retry attempts
   * @param {Array<number>} [config.retryDelays=[1000, 2000, 4000]] - Retry delays in ms
   * @param {number} [config.timeout=10000] - Request timeout in ms
   */
  constructor(config) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    this.environment = config.environment || 'test';
    this.maxRetries = config.maxRetries || 3;
    this.retryDelays = config.retryDelays || [1000, 2000, 4000];
    this.timeout = config.timeout || 10000;
    
    if (!this.apiUrl) {
      throw new Error('Reporting API URL is required');
    }
    
    if (!this.apiKey) {
      throw new Error('API key is required for reporting');
    }
  }
  
  /**
   * Transform k6 results JSON to PerfRunDTO format
   * @param {Object} k6Results - Raw k6 results JSON from handleSummary
   * @param {Object} testMetadata - Additional test metadata
   * @returns {PerfRunDTO} Transformed DTO
   */
  transformResults(k6Results, testMetadata = {}) {
    const metrics = k6Results.metrics || {};
    
    // Extract core metrics with safe fallbacks
    const httpReqDuration = metrics.http_req_duration || {};
    const httpReqFailed = metrics.http_req_failed || {};
    const httpReqs = metrics.http_reqs || {};
    const vus = metrics.vus || {};
    const vusMax = metrics.vus_max || {};
    
    // Calculate VU (peak concurrent users)
    const vu = vusMax.value || vus.max || 0;
    
    // Calculate test duration from root state or metrics
    const testDuration = k6Results.state?.testRunDurationMs 
      ? k6Results.state.testRunDurationMs / 1000 
      : httpReqs.rate ? httpReqs.count / httpReqs.rate : 1;
    
    // Calculate RPS (requests per second)
    const totalRequests = httpReqs.count || 0;
    const rps = httpReqs.rate || (totalRequests / Math.max(testDuration, 1));
    
    // Calculate pass rate
    const failedRequests = httpReqFailed.values?.rate || 0;
    const failedCount = httpReqFailed.values?.fails || 0;
    const passRate = totalRequests > 0 
      ? Math.round(((totalRequests - failedCount) / totalRequests) * 10000) / 100
      : 100;
    
    // Get p95 response time (convert from seconds to milliseconds if needed)
    let p95 = httpReqDuration.values?.['p(95)'] || httpReqDuration['p(95)'] || 0;
    // k6 returns duration in milliseconds already for most metrics
    if (p95 < 10) {
      // If less than 10, it's likely in seconds, convert to ms
      p95 = p95 * 1000;
    }
    
    // Build DTO
    const perfRunDTO = {
      vu: Math.round(vu),
      rps: Math.round(rps * 100) / 100, // Round to 2 decimal places
      passRate: Math.round(passRate * 100) / 100, // Round to 2 decimal places
      p95: Math.round(p95 * 100) / 100, // Round to 2 decimal places
      testName: testMetadata.testName || testMetadata.name || 'k6-performance-test',
      timestamp: new Date().toISOString(),
      environment: this.environment,
      duration: Math.round(testDuration),
      metadata: {
        totalRequests: Math.round(totalRequests),
        failedRequests: Math.round(failedCount),
        avgDuration: Math.round((httpReqDuration.values?.avg || 0) * 100) / 100,
        testStartTime: k6Results.state?.testStartTimestamp || null,
        testEndTime: k6Results.state?.testEndTimestamp || null,
        k6Version: k6Results.root_group?.name || 'unknown',
        ...testMetadata
      }
    };
    
    return perfRunDTO;
  }
  
  /**
   * Send PerfRunDTO to reporting API with retry logic
   * @param {PerfRunDTO} perfRunDTO - Performance run data
   * @returns {Object} API response
   */
  sendReport(perfRunDTO) {
    let lastError = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = this._makeRequest(perfRunDTO);
        
        // Check if request was successful
        if (response.status === 201) {
          console.log(`✅ Performance report sent successfully on attempt ${attempt + 1}`);
          return response;
        } else if (response.status >= 400 && response.status < 500) {
          // Client error - don't retry
          throw new Error(`API returned client error ${response.status}: ${response.body}`);
        } else {
          // Server error or other - retry
          throw new Error(`API returned status ${response.status}: ${response.body}`);
        }
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️  Attempt ${attempt + 1} failed: ${error.message}`);
        
        // If this isn't the last attempt, wait before retrying
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelays[attempt] || this.retryDelays[this.retryDelays.length - 1];
          console.log(`🔄 Retrying in ${delay}ms...`);
          sleep(delay / 1000); // k6 sleep expects seconds
        }
      }
    }
    
    // All attempts failed
    const errorMsg = `Reporting failed after ${this.maxRetries} attempts. Last error: ${lastError?.message}`;
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  /**
   * Make HTTP request to reporting API
   * @private
   * @param {PerfRunDTO} perfRunDTO - Performance run data
   * @returns {Object} HTTP response
   */
  _makeRequest(perfRunDTO) {
    const url = `${this.apiUrl}/api/performance-runs`;
    const payload = JSON.stringify(perfRunDTO);
    
    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'k6-reporting-adapter/1.0.0',
        'Accept': 'application/json'
      },
      timeout: `${this.timeout}ms`,
      tags: {
        name: 'reporting-api-request',
        endpoint: '/api/performance-runs',
        attempt: 'true'
      }
    };
    
    return http.post(url, payload, params);
  }
  
  /**
   * Send k6 results directly (convenience method)
   * @param {Object} k6Results - Raw k6 results JSON
   * @param {Object} testMetadata - Additional test metadata
   * @returns {Object} API response
   */
  reportResults(k6Results, testMetadata = {}) {
    const perfRunDTO = this.transformResults(k6Results, testMetadata);
    return this.sendReport(perfRunDTO);
  }
}

/**
 * Create a reporting adapter with configuration
 * @param {Object} config - Adapter configuration
 * @returns {ReportingAdapter} Configured adapter instance
 */
export function createReportingAdapter(config) {
  return new ReportingAdapter(config);
}

/**
 * Quick report function for immediate use
 * @param {Object} k6Results - Raw k6 results JSON
 * @param {Object} config - Adapter configuration
 * @param {Object} testMetadata - Additional test metadata
 * @returns {Object} API response
 */
export function reportPerformanceResults(k6Results, config, testMetadata = {}) {
  const adapter = new ReportingAdapter(config);
  return adapter.reportResults(k6Results, testMetadata);
}

/**
 * Enhanced handleSummary function that sends reports to API
 * @param {Object} data - k6 test results
 * @param {Object} config - Reporting configuration
 * @param {Object} testMetadata - Test metadata
 * @param {Function} [originalHandler] - Original handleSummary function
 * @returns {Object} Summary output (HTML reports, etc.)
 */
export function createReportingHandleSummary(config, testMetadata = {}, originalHandler = null) {
  return function handleSummary(data) {
    let results = {};
    
    // Call original handler if provided
    if (originalHandler && typeof originalHandler === 'function') {
      results = originalHandler(data) || {};
    }
    
    // Send to reporting API if configured
    if (config.apiUrl && config.apiKey) {
      try {
        console.log('📊 Sending performance report to central API...');
        
        const adapter = new ReportingAdapter(config);
        const response = adapter.reportResults(data, testMetadata);
        
        if (response.status === 201) {
          console.log('✅ Performance report sent successfully!');
          console.log('📊 Dashboard should display new PerfRun row within 10 seconds');
        }
        
        // Add the JSON payload to results for debugging
        const perfRunDTO = adapter.transformResults(data, testMetadata);
        results['reports/perf-run-data.json'] = JSON.stringify(perfRunDTO, null, 2);
        
      } catch (error) {
        console.error('❌ Failed to send performance report:', error.message);
        // Don't fail the test if reporting fails
      }
    } else {
      console.warn('⚠️  Reporting disabled: apiUrl and apiKey must be configured');
    }
    
    return results;
  };
}

// Export default
export default ReportingAdapter; 