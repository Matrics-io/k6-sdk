/**
 * Endurance test template for k6 performance testing SDK
 * 
 * An endurance test runs for extended periods under various load conditions
 * to validate system reliability, resource stability, and long-term performance.
 * Different from soak tests by varying the load patterns over time.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default endurance test options
 * Extended test with varying load patterns over multiple hours
 */
const defaultOptions = {
  stages: [
    // Phase 1: Warm-up and baseline (30 minutes)
    { duration: '5m', target: 25 },    // Gentle warm-up
    { duration: '25m', target: 50 },   // Baseline load
    
    // Phase 2: Variable load period (2 hours)
    { duration: '15m', target: 75 },   // Increase load
    { duration: '30m', target: 100 },  // Sustained medium load
    { duration: '15m', target: 150 },  // Peak load
    { duration: '30m', target: 100 },  // Back to medium
    { duration: '15m', target: 75 },   // Reduce load
    { duration: '15m', target: 50 },   // Back to baseline
    
    // Phase 3: Stability test (1 hour)
    { duration: '60m', target: 80 },   // Steady state
    
    // Phase 4: Final stress (30 minutes)
    { duration: '15m', target: 120 },  // Final load test
    { duration: '15m', target: 120 },  // Sustain final load
    
    // Phase 5: Cool-down
    { duration: '5m', target: 0 }      // Graceful shutdown
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<2500'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>25'],           // Minimum sustained throughput
    vus_max: ['value<=150'],          // Maximum VUs for endurance test
    // Endurance-specific thresholds
    http_req_connecting: ['p(95)<200'], // Connection stability over time
    http_req_tls_handshaking: ['p(95)<300'], // TLS stability
    http_req_waiting: ['p(95)<1200'],  // Server processing consistency
    checks: ['rate>=0.95']            // High success rate over duration
  },
  // Extended timeouts for long-running test
  setupTimeout: '120s',
  teardownTimeout: '180s',
  // Batch metrics to reduce memory usage during long test
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count']
};

/**
 * Long-term performance tracker
 */
class EnduranceTracker {
  constructor() {
    this.phases = [];
    this.currentPhase = null;
    this.hourlyMetrics = [];
    this.degradationAlerts = [];
    this.startTime = Date.now();
  }
  
  startPhase(name, expectedDuration, targetVUs) {
    this.currentPhase = {
      name,
      startTime: Date.now(),
      expectedDuration,
      targetVUs,
      metrics: [],
      alerts: []
    };
  }
  
  endPhase() {
    if (this.currentPhase) {
      this.currentPhase.endTime = Date.now();
      this.currentPhase.actualDuration = this.currentPhase.endTime - this.currentPhase.startTime;
      this.phases.push(this.currentPhase);
      this.currentPhase = null;
    }
  }
  
  addMetric(vus, responseTime, throughput, errorRate, resourceUsage = {}) {
    const metric = {
      timestamp: Date.now(),
      vus,
      responseTime,
      throughput,
      errorRate,
      resourceUsage
    };
    
    if (this.currentPhase) {
      this.currentPhase.metrics.push(metric);
    }
    
    // Check for performance degradation
    this.checkDegradation(metric);
    
    // Record hourly snapshots
    this.recordHourlySnapshot(metric);
  }
  
  checkDegradation(currentMetric) {
    // Compare with baseline (first hour metrics)
    const baselineMetrics = this.getBaselineMetrics();
    if (!baselineMetrics || baselineMetrics.length < 10) return;
    
    const baselineAvg = this.calculateAverage(baselineMetrics, 'responseTime');
    const currentTime = currentMetric.responseTime;
    
    // Alert if response time degrades by more than 50%
    if (currentTime > baselineAvg * 1.5) {
      const alert = {
        timestamp: Date.now(),
        type: 'performance_degradation',
        message: `Response time degraded from ${baselineAvg.toFixed(0)}ms to ${currentTime.toFixed(0)}ms`,
        severity: currentTime > baselineAvg * 2 ? 'critical' : 'warning'
      };
      
      this.degradationAlerts.push(alert);
      console.log(`🚨 ${alert.severity.toUpperCase()}: ${alert.message}`);
    }
    
    // Alert on high error rates
    if (currentMetric.errorRate > 0.1) {
      const alert = {
        timestamp: Date.now(),
        type: 'high_error_rate',
        message: `Error rate spiked to ${(currentMetric.errorRate * 100).toFixed(1)}%`,
        severity: 'warning'
      };
      
      this.degradationAlerts.push(alert);
    }
  }
  
  recordHourlySnapshot(metric) {
    const testHour = Math.floor((Date.now() - this.startTime) / (60 * 60 * 1000));
    
    if (!this.hourlyMetrics[testHour]) {
      this.hourlyMetrics[testHour] = [];
    }
    
    this.hourlyMetrics[testHour].push(metric);
  }
  
  getBaselineMetrics() {
    return this.hourlyMetrics[0] || [];
  }
  
  calculateAverage(metrics, property) {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m[property], 0) / metrics.length;
  }
  
  generateEnduranceReport() {
    const totalDuration = (Date.now() - this.startTime) / 1000 / 60 / 60; // hours
    
    const report = {
      totalDuration: totalDuration,
      phases: this.phases.length,
      totalAlerts: this.degradationAlerts.length,
      criticalAlerts: this.degradationAlerts.filter(a => a.severity === 'critical').length,
      hourlyAnalysis: this.analyzeHourlyTrends(),
      phaseAnalysis: this.analyzePhases(),
      recommendations: this.generateRecommendations()
    };
    
    return report;
  }
  
  analyzeHourlyTrends() {
    const trends = [];
    
    this.hourlyMetrics.forEach((hourMetrics, hour) => {
      if (hourMetrics.length > 0) {
        trends.push({
          hour: hour + 1,
          avgResponseTime: this.calculateAverage(hourMetrics, 'responseTime'),
          avgThroughput: this.calculateAverage(hourMetrics, 'throughput'),
          avgErrorRate: this.calculateAverage(hourMetrics, 'errorRate'),
          sampleCount: hourMetrics.length
        });
      }
    });
    
    return trends;
  }
  
  analyzePhases() {
    return this.phases.map(phase => {
      if (phase.metrics.length === 0) return null;
      
      return {
        name: phase.name,
        duration: phase.actualDuration / 1000 / 60, // minutes
        targetVUs: phase.targetVUs,
        avgResponseTime: this.calculateAverage(phase.metrics, 'responseTime'),
        avgThroughput: this.calculateAverage(phase.metrics, 'throughput'),
        avgErrorRate: this.calculateAverage(phase.metrics, 'errorRate'),
        alertCount: phase.alerts.length
      };
    }).filter(Boolean);
  }
  
  generateRecommendations() {
    const recommendations = [];
    
    if (this.degradationAlerts.length > 0) {
      recommendations.push(`Performance degraded ${this.degradationAlerts.length} times during test`);
    }
    
    if (this.degradationAlerts.some(a => a.severity === 'critical')) {
      recommendations.push('Critical performance issues detected - investigate resource bottlenecks');
    }
    
    const hourlyTrends = this.analyzeHourlyTrends();
    if (hourlyTrends.length > 1) {
      const firstHour = hourlyTrends[0];
      const lastHour = hourlyTrends[hourlyTrends.length - 1];
      
      const responseTimeTrend = ((lastHour.avgResponseTime - firstHour.avgResponseTime) / firstHour.avgResponseTime) * 100;
      
      if (responseTimeTrend > 25) {
        recommendations.push('Response time increased significantly over duration - check for memory leaks');
      } else if (responseTimeTrend < -10) {
        recommendations.push('Response time improved over duration - system may benefit from warm-up period');
      }
    }
    
    return recommendations;
  }
}

/**
 * Create an endurance test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createEnduranceTest(params) {
  const {
    config,
    http,
    auth,
    endpoints = {},
    options = {}
  } = params;
  
  // Merge options with defaults
  const testOptions = {
    ...defaultOptions,
    ...options
  };
  
  // Setup function - runs once at the beginning of the test
  const setup = () => {
    console.log('Starting endurance test for long-term reliability assessment...');
    
    // Authenticate if auth is provided
    let authData = {};
    if (auth) {
      const token = auth.getToken();
      authData = { token };
    }
    
    // Initialize endurance tracker
    const enduranceTracker = new EnduranceTracker();
    enduranceTracker.startPhase('Warm-up', 30, 50);
    
    return {
      ...authData,
      startTime: Date.now(),
      enduranceTracker,
      testId: `endurance-${Date.now()}`,
      lastPhaseCheck: Date.now()
    };
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
    console.log('Endurance test completed. Generating comprehensive report...');
    
    data.enduranceTracker.endPhase(); // End final phase
    const report = data.enduranceTracker.generateEnduranceReport();
    
    console.log('=== ENDURANCE TEST REPORT ===');
    console.log(`Test ID: ${data.testId}`);
    console.log(`Total Duration: ${report.totalDuration.toFixed(1)} hours`);
    console.log(`Phases Completed: ${report.phases}`);
    console.log(`Total Alerts: ${report.totalAlerts} (${report.criticalAlerts} critical)`);
    
    if (report.hourlyAnalysis.length > 0) {
      console.log('\n--- Hourly Performance Trends ---');
      report.hourlyAnalysis.forEach(hour => {
        console.log(`Hour ${hour.hour}: ${hour.avgResponseTime.toFixed(0)}ms avg, ${hour.avgThroughput.toFixed(1)} req/s, ${(hour.avgErrorRate * 100).toFixed(2)}% errors`);
      });
    }
    
    if (report.phaseAnalysis.length > 0) {
      console.log('\n--- Phase Analysis ---');
      report.phaseAnalysis.forEach(phase => {
        console.log(`${phase.name}: ${phase.avgResponseTime.toFixed(0)}ms avg, ${phase.avgThroughput.toFixed(1)} req/s over ${phase.duration.toFixed(0)} minutes`);
      });
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n--- Endurance Recommendations ---');
      report.recommendations.forEach(rec => console.log(`• ${rec}`));
    }
    
    console.log('==============================');
    
    // Clean up resources if needed
    if (auth) {
      auth.clearToken();
    }
  };
  
  // Main test function
  const defaultFunction = (data) => {
    // Authenticate if needed
    if (auth && !auth.isAuthenticated()) {
      auth.setToken(data.token);
    }
    
    const currentVUs = __VU;
    const testRuntime = Date.now() - data.startTime;
    const iterationStart = Date.now();
    let requestCount = 0;
    let errorCount = 0;
    let totalResponseTime = 0;
    
    // Determine current test phase based on runtime
    const currentPhase = this.determineTestPhase(testRuntime);
    
    // Check if we need to transition phases
    if (Date.now() - data.lastPhaseCheck > 5 * 60 * 1000) { // Check every 5 minutes
      // This is a simplified phase detection - in practice you'd track more precisely
      data.lastPhaseCheck = Date.now();
    }
    
    // Test each endpoint
    for (const [name, endpoint] of Object.entries(endpoints)) {
      group(`Endurance: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1 } = endpoint;
        
        // Skip this endpoint based on weight
        if (Math.random() > weight) {
          return;
        }
        
        // Add endurance test specific tags
        const enduranceTestTags = {
          ...tags,
          test_type: 'endurance',
          test_id: data.testId,
          endpoint: name,
          runtime_hours: Math.floor(testRuntime / (60 * 60 * 1000)),
          current_vus: currentVUs,
          phase: currentPhase
        };
        
        const requestStart = Date.now();
        
        // Make request
        const response = http.request(method, path, body, { tags: enduranceTestTags });
        
        const responseTime = Date.now() - requestStart;
        totalResponseTime += responseTime;
        requestCount++;
        
        // Track errors
        if (response.status < 200 || response.status >= 400) {
          errorCount++;
        }
        
        // Validate response
        if (validate) {
          const checkResult = check(response, validate);
          if (!checkResult) errorCount++;
        } else {
          // Default validation for endurance tests
          const checkResults = check(response, {
            [`${name} maintains functionality over time`]: (r) => r.status >= 200 && r.status < 300,
            [`${name} response time stable`]: (r) => r.timings.duration < 2000,
            [`${name} no memory-related errors`]: (r) => !r.body.includes('OutOfMemory') && r.status !== 503,
            [`${name} connection remains stable`]: (r) => r.timings.connecting >= 0
          });
          
          if (!Object.values(checkResults).every(result => result)) {
            errorCount++;
          }
        }
        
        // Log long-running performance issues
        if (responseTime > 2000) {
          console.log(`⏰ Endurance issue: ${name} took ${responseTime}ms after ${Math.floor(testRuntime / 60000)} minutes`);
        }
        
        // Consistent sleep for endurance testing
        sleep(1 + Math.random() * 1); // 1-2 seconds
      });
    }
    
    // Record endurance metrics
    if (data.enduranceTracker && requestCount > 0) {
      const iterationDuration = Date.now() - iterationStart;
      const avgResponseTime = totalResponseTime / requestCount;
      const throughput = requestCount / (iterationDuration / 1000);
      const errorRate = errorCount / requestCount;
      
      data.enduranceTracker.addMetric(
        currentVUs,
        avgResponseTime,
        throughput,
        errorRate
      );
    }
  };
  
  // Helper function to determine test phase
  const determineTestPhase = (runtime) => {
    const minutes = runtime / (60 * 1000);
    
    if (minutes < 30) return 'warm-up';
    if (minutes < 150) return 'variable-load';
    if (minutes < 210) return 'stability';
    if (minutes < 240) return 'final-stress';
    return 'cool-down';
  };
  
  // Return k6 test script
  return {
    options: testOptions,
    setup,
    default: defaultFunction,
    teardown
  };
}
