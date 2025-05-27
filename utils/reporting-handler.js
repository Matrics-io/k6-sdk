/**
 * Reusable handleSummary function for k6 performance reporting
 * 
 * This module provides a standardized handleSummary function that can be
 * imported and used across different k6 tests for consistent reporting.
 */

import { ReportingAdapter } from './reporting.js';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

/**
 * Create a reusable handleSummary function for performance reporting
 * @param {Object} testMetadata - Test-specific metadata
 * @param {Object} [options={}] - Additional options
 * @param {Function} [options.customHandler] - Custom handler for additional processing
 * @param {boolean} [options.generateFiles=false] - Whether to generate local files
 * @param {boolean} [options.generateHtmlReport=true] - Whether to generate HTML report
 * @param {string} [options.reportPrefix='TestReport'] - Prefix for report filename
 * @returns {Function} handleSummary function
 */
export function createHandleSummary(testMetadata, options = {}) {
  return function handleSummary(data) {
    const results = {};
    
    // Generate HTML report by default
    if (options.generateHtmlReport !== false) {
      const timestamp = new Date().toISOString().split('.')[0].replace(/[:T]/g, '-');
      const reportPrefix = options.reportPrefix || testMetadata.testName || 'TestReport';
      const filename = `reports/${reportPrefix}_${timestamp}.html`;
      
      results[filename] = htmlReport(data, {
        title: `${reportPrefix} - Performance Test Report`,
        description: testMetadata.description || `Performance test results for ${testMetadata.testName}`,
        logo: '../../docs/static/img/matrics-logo.png'
      });
      
      console.log(`📊 HTML report will be saved as: ${filename}`);
    }
    
    // Generate text summary for console
    results['stdout'] = textSummary(data, { indent: ' ', enableColors: true });
    
    // Generate JSON summary if requested
    if (options.generateFiles) {
      const timestamp = new Date().toISOString().split('.')[0].replace(/[:T]/g, '-');
      const reportPrefix = options.reportPrefix || testMetadata.testName || 'TestReport';
      results[`reports/${reportPrefix}_${timestamp}.json`] = JSON.stringify(data, null, 2);
    }
    
    // Call custom handler if provided (for additional processing)
    if (options.customHandler && typeof options.customHandler === 'function') {
      const customResults = options.customHandler(data);
      Object.assign(results, customResults);
    }
    
    // Send to reporting API if configured
    if (__ENV.REPORTING_API_URL && __ENV.REPORTING_API_KEY) {
      try {
        console.log('📊 Sending performance report to central API...');
        
        const adapter = new ReportingAdapter({
          apiUrl: __ENV.REPORTING_API_URL,
          apiKey: __ENV.REPORTING_API_KEY,
          environment: __ENV.TEST_ENVIRONMENT || 'test',
          maxRetries: parseInt(__ENV.REPORTING_MAX_RETRIES) || 3,
          timeout: parseInt(__ENV.REPORTING_TIMEOUT) || 10000
        });
        
        const response = adapter.reportResults(data, testMetadata);
        
        if (response.status === 201) {
          console.log('✅ Performance report sent successfully!');
          console.log('📊 Dashboard should display new PerfRun row within 10 seconds');
        }
        
        // Save debug file with API data
        if (options.generateFiles) {
          const perfRunDTO = adapter.transformResults(data, testMetadata);
          results['reports/perf-run-data.json'] = JSON.stringify(perfRunDTO, null, 2);
        }
        
      } catch (error) {
        console.error('❌ Failed to send performance report:', error.message);
        // Don't fail the test if reporting fails
      }
    } else {
      console.warn('⚠️  Reporting disabled: REPORTING_API_URL and REPORTING_API_KEY must be set');
    }
    
    return results;
  };
}

/**
 * Create handleSummary specifically for HTML reports (simplified)
 * @param {string} testName - Name of the test
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.reportPrefix] - Custom prefix for report filename
 * @param {string} [options.description] - Test description for the report
 * @returns {Function} handleSummary function that generates HTML reports
 */
export function createHtmlReportSummary(testName, options = {}) {
  const testMetadata = {
    testName: testName,
    description: options.description || `Performance test results for ${testName}`,
    timestamp: new Date().toISOString(),
    environment: __ENV.TEST_ENVIRONMENT || 'test'
  };
  
  return function handleSummary(data) {
    const timestamp = new Date().toISOString().split('.')[0].replace(/[:T]/g, '-');
    const reportPrefix = options.reportPrefix || testName;
    
    return {
      [`reports/${reportPrefix}_${timestamp}.html`]: htmlReport(data, {
        title: `${reportPrefix} - Performance Test Report`,
        description: testMetadata.description,
        logo: '../../docs/static/img/matrics-logo.png'
      }),
      'stdout': textSummary(data, { indent: ' ', enableColors: true })
    };
  };
}

/**
 * Quick handleSummary for simple tests (no custom processing)
 * @param {Object} testMetadata - Test metadata
 * @returns {Function} handleSummary function
 */
export function simpleHandleSummary(testMetadata) {
  return createHandleSummary(testMetadata);
}

/**
 * Default test metadata template
 * @param {string} testName - Name of the test
 * @param {Object} [overrides={}] - Additional metadata to merge
 * @returns {Object} Test metadata object
 */
export function createTestMetadata(testName, overrides = {}) {
  return {
    testName,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: __ENV.TEST_ENVIRONMENT || 'test',
    ...overrides
  };
}

// Export default
export default {
  createHandleSummary,
  createHtmlReportSummary,
  simpleHandleSummary,
  createTestMetadata
}; 