import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

/**
 * Generic K6 Test Reporting Utilities
 * 
 * This module provides reusable functions for generating comprehensive test reports
 * from K6 test data, including ReportPortal-compatible structured data.
 */

/**
 * Default report configuration
 */
const DEFAULT_CONFIG = {
  basePath: '/src/reports/',
  testName: 'Performance Test',
  reportDate: null, // Will be auto-generated if null
  includeRawData: true,
  includeStructuredData: true,
  includePerformanceMetrics: true,
  htmlOptions: {
    title: 'Performance Test Results',
    logos: {
      k6: 'https://avatars.githubusercontent.com/u/11512485',
    },
  }
};

/**
 * Generate comprehensive test reports from K6 data
 * @param {Object} data - K6 test results data
 * @param {Object} config - Report configuration options
 * @returns {Object} Object containing report files
 */
export function generateComprehensiveReports(data, config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const reportDate = finalConfig.reportDate || new Date().toISOString().split('.')[0].replace(/[:T]/g, '-');
  
  // Generate report sections
  const testOverview = generateTestOverview(data, finalConfig.testName);
  const iterationMetrics = generateIterationMetrics(data);
  const testAnalysis = generateTestAnalysis(data);
  
  // Combine all sections into comprehensive report
  const comprehensiveReport = `
# COMPREHENSIVE TEST REPORT - ${finalConfig.testName}
Generated: ${new Date().toISOString()}

${testOverview}

${iterationMetrics}

${testAnalysis}

${finalConfig.includeRawData ? `# RAW DATA\n${JSON.stringify(data, null, 2)}` : ''}
  `;
  
  const files = {
    // HTML Report with charts and detailed metrics
    [`${finalConfig.basePath}${finalConfig.testName.replace(/\s+/g, '')}_Report_${reportDate}.html`]: htmlReport(data, {
      title: finalConfig.htmlOptions.title || `${finalConfig.testName} Results`,
      logos: finalConfig.htmlOptions.logos || {},
    }),
    
    // Comprehensive text summary
    [`${finalConfig.basePath}${finalConfig.testName.replace(/\s+/g, '')}_Summary_${reportDate}.txt`]: comprehensiveReport,
  };

  // Add optional reports based on configuration
  if (finalConfig.includeRawData) {
    files[`${finalConfig.basePath}RawK6Data_${reportDate}.json`] = JSON.stringify(data, null, 2);
  }

  if (finalConfig.includeStructuredData) {
    const structuredData = generateStructuredTestData(data);
    files[`${finalConfig.basePath}StructuredTestData_${reportDate}.json`] = JSON.stringify(structuredData, null, 2);
  }

  if (finalConfig.includePerformanceMetrics) {
    const performanceMetrics = generatePerformanceMetrics(data);
    files[`${finalConfig.basePath}PerformanceMetrics_${reportDate}.json`] = JSON.stringify(performanceMetrics, null, 2);
  }
  
  return files;
}

/**
 * Generate comprehensive test overview section
 * @param {Object} data - K6 test results data
 * @param {string} testName - Name of the test
 * @returns {string} Formatted test overview
 */
export function generateTestOverview(data, testName = 'Load Test') {
  const metrics = data.metrics || {};
  const state = data.state || {};
  
  // Calculate key metrics
  const totalDuration = data.state ? (data.state.testRunDurationMs / 1000).toFixed(2) : 'N/A';
  const totalRequests = metrics.http_reqs ? metrics.http_reqs.values.count : 0;
  const failedRequests = metrics.http_req_failed ? metrics.http_req_failed.values.count : 0;
  const successRate = totalRequests > 0 ? ((totalRequests - failedRequests) / totalRequests * 100).toFixed(2) : 'N/A';
  const avgResponseTime = metrics.http_req_duration ? metrics.http_req_duration.values.avg.toFixed(2) : 'N/A';
  const throughput = metrics.http_reqs ? metrics.http_reqs.values.rate.toFixed(2) : 'N/A';
  const maxVUs = metrics.vus_max ? metrics.vus_max.values.max : 'N/A';
  const totalFailedVUs = metrics.vus ? (metrics.vus.values.max - (metrics.vus.values.max * (1 - (failedRequests / totalRequests)))) : 0;
  
  // Calculate data transfer
  const dataSent = metrics.data_sent ? (metrics.data_sent.values.count / 1024 / 1024).toFixed(2) : 'N/A';
  const dataReceived = metrics.data_received ? (metrics.data_received.values.count / 1024 / 1024).toFixed(2) : 'N/A';
  
  // Check thresholds
  const thresholds = data.thresholds || {};
  const thresholdResults = Object.entries(thresholds).map(([name, threshold]) => {
    const metric = metrics[name];
    if (!metric) return `- ${name}: No data available`;
    
    const passed = threshold.passes > 0;
    const status = passed ? 'PASSED' : 'FAILED';
    return `- ${name}: ${status} (${threshold.passes}/${threshold.passes + threshold.fails})`;
  }).join('\n');
  
  return `
## TEST OVERVIEW - ${testName}
- **Type**: ${testName}
- **Duration**: ${totalDuration} seconds
- **Throughput**: ${throughput} requests/second
- **Environment**: ${__ENV.BASE_URL || 'Default'}
- **Total Failed VUs**: ${totalFailedVUs.toFixed(0)}
- **Success Rate**: ${successRate}%
- **Average Response Time**: ${avgResponseTime}ms
- **Checks Passed**: ${(() => {
    if (!data.root_group) return '0/0';
    function countChecks(group) {
      let totalPasses = 0, totalFails = 0;
      if (group.checks && Array.isArray(group.checks)) {
        for (const check of group.checks) {
          totalPasses += check.passes || 0;
          totalFails += check.fails || 0;
        }
      }
      if (group.groups && Array.isArray(group.groups)) {
        for (const nestedGroup of group.groups) {
          const nested = countChecks(nestedGroup);
          totalPasses += nested.passes;
          totalFails += nested.fails;
        }
      }
      return { passes: totalPasses, fails: totalFails };
    }
    const counts = countChecks(data.root_group);
    return `${counts.passes}/${counts.passes + counts.fails}`;
  })()}
- **Max VUs**: ${maxVUs}
- **Data Transfer**: ${dataSent}MB sent, ${dataReceived}MB received

## THRESHOLDS
${thresholdResults}
  `;
}

/**
 * Generate iteration metrics section
 * @param {Object} data - K6 test results data
 * @returns {string} Formatted iteration metrics
 */
export function generateIterationMetrics(data) {
  const metrics = data.metrics || {};
  
  return `
## ITERATION METRICS
- **Total Iterations**: ${metrics.iterations ? metrics.iterations.values.count : 'N/A'}
- **Iteration Rate**: ${metrics.iterations ? metrics.iterations.values.rate.toFixed(2) : 'N/A'} iterations/second
- **Average Iteration Duration**: ${metrics.iteration_duration ? metrics.iteration_duration.values.avg.toFixed(2) : 'N/A'}ms
- **Min Iteration Duration**: ${metrics.iteration_duration ? metrics.iteration_duration.values.min.toFixed(2) : 'N/A'}ms
- **Max Iteration Duration**: ${metrics.iteration_duration ? metrics.iteration_duration.values.max.toFixed(2) : 'N/A'}ms
  `;
}

/**
 * Generate detailed test analysis section
 * @param {Object} data - K6 test results data
 * @returns {string} Formatted test analysis
 */
export function generateTestAnalysis(data) {
  const metrics = data.metrics || {};
  const rootGroup = data.root_group || {};
  
  // Response time percentiles
  const responseTimeP95 = metrics.http_req_duration ? metrics.http_req_duration.values['p(95)'].toFixed(2) : 'N/A';
  const responseTimeP99 = metrics.http_req_duration ? metrics.http_req_duration.values['p(99)'].toFixed(2) : 'N/A';
  
  // Detailed check results with proper aggregation
  const checkResults = (() => {
    if (!rootGroup) return 'No check data available';
    
    function countChecks(group) {
      let totalPasses = 0, totalFails = 0;
      if (group.checks && Array.isArray(group.checks)) {
        for (const check of group.checks) {
          totalPasses += check.passes || 0;
          totalFails += check.fails || 0;
        }
      }
      if (group.groups && Array.isArray(group.groups)) {
        for (const nestedGroup of group.groups) {
          const nested = countChecks(nestedGroup);
          totalPasses += nested.passes;
          totalFails += nested.fails;
        }
      }
      return { passes: totalPasses, fails: totalFails };
    }
    
    const counts = countChecks(rootGroup);
    const total = counts.passes + counts.fails;
    const successRate = total > 0 ? ((counts.passes / total) * 100).toFixed(2) : '0.00';
    
    return `
### Detailed Check Results
- **Request Success Rate**: ${counts.passes}/${total} (${successRate}%)
- **Bundle Processing**: ${counts.passes > 0 ? 'PASSED' : 'FAILED'}
- **Threshold Compliance**: ${Object.values(data.thresholds || {}).every(t => t.passes > 0) ? 'PASSED' : 'FAILED'}
- **Scaling Behavior**: ${metrics.vus ? 'Analyzed' : 'Not Available'}
- **Service Invocation**: ${metrics.http_reqs ? 'Successful' : 'Failed'}
    `;
  })();
  
  return `
## TEST ANALYSIS
- **Duration**: ${data.state ? (data.state.testRunDurationMs / 1000).toFixed(2) : 'N/A'} seconds
- **Response Time P95**: ${responseTimeP95}ms
- **Response Time P99**: ${responseTimeP99}ms
- **Total Requests**: ${metrics.http_reqs ? metrics.http_reqs.values.count : 'N/A'}
- **Failed Requests**: ${metrics.http_req_failed ? metrics.http_req_failed.values.count : 'N/A'}
- **Request Rate**: ${metrics.http_reqs ? metrics.http_reqs.values.rate.toFixed(2) : 'N/A'} req/s

${checkResults}

### Performance Request Metrics
- **Min Response Time**: ${metrics.http_req_duration ? metrics.http_req_duration.values.min.toFixed(2) : 'N/A'}ms
- **Max Response Time**: ${metrics.http_req_duration ? metrics.http_req_duration.values.max.toFixed(2) : 'N/A'}ms
- **Median Response Time**: ${metrics.http_req_duration ? metrics.http_req_duration.values.med.toFixed(2) : 'N/A'}ms
- **Average Response Time**: ${metrics.http_req_duration ? metrics.http_req_duration.values.avg.toFixed(2) : 'N/A'}ms
  `;
}

/**
 * Generate structured test data for ReportPortal integration
 * @param {Object} data - K6 test results data
 * @returns {Object} Structured data object
 */
export function generateStructuredTestData(data) {
  const metrics = data.metrics || {};
  
  // Helper function to recursively count checks from groups
  function countChecks(group) {
    let totalPasses = 0;
    let totalFails = 0;
    
    // Count checks in current group
    if (group.checks && Array.isArray(group.checks)) {
      for (const check of group.checks) {
        totalPasses += check.passes || 0;
        totalFails += check.fails || 0;
      }
    }
    
    // Recursively count checks in nested groups
    if (group.groups && Array.isArray(group.groups)) {
      for (const nestedGroup of group.groups) {
        const nestedCounts = countChecks(nestedGroup);
        totalPasses += nestedCounts.passes;
        totalFails += nestedCounts.fails;
      }
    }
    
    return { passes: totalPasses, fails: totalFails };
  }
  
  const checkCounts = data.root_group ? countChecks(data.root_group) : { passes: 0, fails: 0 };
  
  return {
    test_duration: data.state ? (data.state.testRunDurationMs / 1000) : 0,
    metrics: {
      iterations: {
        count: metrics.iterations ? metrics.iterations.values.count : 0,
        rate: metrics.iterations ? metrics.iterations.values.rate : 0,
      },
      checks: {
        passes: checkCounts.passes,
        fails: checkCounts.fails,
      },
      iteration_duration: {
        avg: metrics.iteration_duration ? metrics.iteration_duration.values.avg : 0,
        min: metrics.iteration_duration ? metrics.iteration_duration.values.min : 0,
        max: metrics.iteration_duration ? metrics.iteration_duration.values.max : 0,
        med: metrics.iteration_duration ? metrics.iteration_duration.values.med : 0,
        'p(95)': metrics.iteration_duration ? metrics.iteration_duration.values['p(95)'] : 0,
        'p(99)': metrics.iteration_duration ? metrics.iteration_duration.values['p(99)'] : 0,
      },
      http_req_duration: {
        avg: metrics.http_req_duration ? metrics.http_req_duration.values.avg : 0,
        min: metrics.http_req_duration ? metrics.http_req_duration.values.min : 0,
        max: metrics.http_req_duration ? metrics.http_req_duration.values.max : 0,
        med: metrics.http_req_duration ? metrics.http_req_duration.values.med : 0,
        'p(95)': metrics.http_req_duration ? metrics.http_req_duration.values['p(95)'] : 0,
        'p(99)': metrics.http_req_duration ? metrics.http_req_duration.values['p(99)'] : 0,
      },
      vus: {
        value: metrics.vus ? metrics.vus.values.value : 0,
      },
      vus_max: {
        max: metrics.vus_max ? metrics.vus_max.values.max : 0,
      },
      data_sent: {
        count: metrics.data_sent ? metrics.data_sent.values.count : 0,
      },
      data_received: {
        count: metrics.data_received ? metrics.data_received.values.count : 0,
      },
      http_reqs: {
        count: metrics.http_reqs ? metrics.http_reqs.values.count : 0,
        rate: metrics.http_reqs ? metrics.http_reqs.values.rate : 0,
      },
      http_req_failed: {
        count: metrics.http_req_failed ? metrics.http_req_failed.values.count : 0,
        rate: metrics.http_req_failed ? metrics.http_req_failed.values.rate : 0,
      },
    },
    thresholds: data.thresholds || {},
    root_group: data.root_group || {},
  };
}

/**
 * Generate performance metrics summary
 * @param {Object} data - K6 test results data
 * @returns {Object} Performance metrics object
 */
export function generatePerformanceMetrics(data) {
  const metrics = data.metrics || {};
  
  return {
    summary: {
      test_duration_seconds: data.state ? (data.state.testRunDurationMs / 1000) : 0,
      total_requests: metrics.http_reqs ? metrics.http_reqs.values.count : 0,
      failed_requests: metrics.http_req_failed ? metrics.http_req_failed.values.count : 0,
      success_rate: metrics.http_req_failed ? (1 - metrics.http_req_failed.values.rate) * 100 : 0,
      requests_per_second: metrics.http_reqs ? metrics.http_reqs.values.rate : 0,
      avg_response_time_ms: metrics.http_req_duration ? metrics.http_req_duration.values.avg : 0,
      p95_response_time_ms: metrics.http_req_duration ? metrics.http_req_duration.values['p(95)'] : 0,
      p99_response_time_ms: metrics.http_req_duration ? metrics.http_req_duration.values['p(99)'] : 0,
    },
    response_times: {
      min: metrics.http_req_duration ? metrics.http_req_duration.values.min : 0,
      max: metrics.http_req_duration ? metrics.http_req_duration.values.max : 0,
      avg: metrics.http_req_duration ? metrics.http_req_duration.values.avg : 0,
      med: metrics.http_req_duration ? metrics.http_req_duration.values.med : 0,
      p90: metrics.http_req_duration ? metrics.http_req_duration.values['p(90)'] : 0,
      p95: metrics.http_req_duration ? metrics.http_req_duration.values['p(95)'] : 0,
      p99: metrics.http_req_duration ? metrics.http_req_duration.values['p(99)'] : 0,
    },
    data_transfer: {
      bytes_sent: metrics.data_sent ? metrics.data_sent.values.count : 0,
      bytes_received: metrics.data_received ? metrics.data_received.values.count : 0,
      transfer_rate_bps: {
        sent: metrics.data_sent ? metrics.data_sent.values.rate : 0,
        received: metrics.data_received ? metrics.data_received.values.rate : 0,
      }
    },
    virtual_users: {
      current: metrics.vus ? metrics.vus.values.value : 0,
      max: metrics.vus_max ? metrics.vus_max.values.max : 0,
    },
    iterations: {
      total: metrics.iterations ? metrics.iterations.values.count : 0,
      rate: metrics.iterations ? metrics.iterations.values.rate : 0,
      avg_duration_ms: metrics.iteration_duration ? metrics.iteration_duration.values.avg : 0,
    },
    thresholds_passed: data.thresholds ? Object.values(data.thresholds).every(t => t.passes > 0) : false,
    checks_passed: (() => {
      if (!data.root_group) return 0;
      function countChecks(group) {
        let totalPasses = 0, totalFails = 0;
        if (group.checks && Array.isArray(group.checks)) {
          for (const check of group.checks) {
            totalPasses += check.passes || 0;
            totalFails += check.fails || 0;
          }
        }
        if (group.groups && Array.isArray(group.groups)) {
          for (const nestedGroup of group.groups) {
            const nested = countChecks(nestedGroup);
            totalPasses += nested.passes;
            totalFails += nested.fails;
          }
        }
        return { passes: totalPasses, fails: totalFails };
      }
      return countChecks(data.root_group).passes;
    })(),
    checks_failed: (() => {
      if (!data.root_group) return 0;
      function countChecks(group) {
        let totalPasses = 0, totalFails = 0;
        if (group.checks && Array.isArray(group.checks)) {
          for (const check of group.checks) {
            totalPasses += check.passes || 0;
            totalFails += check.fails || 0;
          }
        }
        if (group.groups && Array.isArray(group.groups)) {
          for (const nestedGroup of group.groups) {
            const nested = countChecks(nestedGroup);
            totalPasses += nested.passes;
            totalFails += nested.fails;
          }
        }
        return { passes: totalPasses, fails: totalFails };
      }
      return countChecks(data.root_group).fails;
    })(),
  };
}

/**
 * Simple report generation for basic use cases
 * @param {Object} data - K6 test results data
 * @param {string} testName - Name of the test
 * @returns {Object} Basic report files
 */
export function generateBasicReports(data, testName = 'Performance Test') {
  return generateComprehensiveReports(data, {
    testName,
    includeRawData: false,
    includeStructuredData: false,
    includePerformanceMetrics: false,
  });
}

/**
 * ReportPortal-focused report generation
 * @param {Object} data - K6 test results data
 * @param {string} testName - Name of the test
 * @returns {Object} ReportPortal-compatible report files
 */
export function generateReportPortalReports(data, testName = 'Performance Test') {
  return generateComprehensiveReports(data, {
    testName,
    includeRawData: false,
    includeStructuredData: true,
    includePerformanceMetrics: true,
    htmlOptions: {
      title: `${testName} - ReportPortal Integration`,
    }
  });
}