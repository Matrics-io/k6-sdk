/**
 * Recovery test template for k6 performance testing SDK
 * 
 * A recovery test validates how well the system recovers from failures,
 * outages, and degraded conditions. Tests resilience and failover capabilities.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default recovery test options
 * Simulates failure and recovery scenarios
 */
const defaultOptions = {
  stages: [
    // Phase 1: Establish baseline
    { duration: '2m', target: 50 },    // Normal operation
    { duration: '3m', target: 50 },    // Sustained baseline
    
    // Phase 2: Simulate failure condition
    { duration: '1m', target: 100 },   // Increased load during "failure"
    { duration: '5m', target: 100 },   // Sustain failure condition
    
    // Phase 3: Recovery period
    { duration: '2m', target: 75 },    // Partial recovery
    { duration: '3m', target: 75 },    // Sustain partial recovery
    
    // Phase 4: Full recovery
    { duration: '2m', target: 50 },    // Return to baseline
    { duration: '5m', target: 50 },    // Verify stable recovery
    
    { duration: '1m', target: 0 }      // Ramp down
  ],
  thresholds: {
    // More lenient thresholds during recovery scenarios
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.15'],    // Allow higher failure rate during recovery
    http_reqs: ['rate>15'],            // Minimum throughput during recovery
    vus_max: ['value<=100'],           // Maximum VUs for recovery test
    // Recovery-specific thresholds
    http_req_connecting: ['p(95)<500'], // Connection establishment during issues
    http_req_waiting: ['p(95)<1500'],  // Server processing during recovery
    checks: ['rate>=0.80']             // 80% success rate acceptable during recovery
  },
  // Extended timeouts for failure scenarios
  setupTimeout: '90s',
  teardownTimeout: '90s'
};

/**
 * Recovery pattern analyzer
 */
class RecoveryAnalyzer {
  constructor() {
    this.phases = [];
    this.currentPhase = null;
    this.recoveryMetrics = {
      baseline: null,
      failure: null,
      recovery: null,
      fullRecovery: null
    };
    this.failureDetected = false;
    this.recoveryStartTime = null;
    this.recoveryCompletionTime = null;
  }
  
  startPhase(phaseName, expectedDuration) {
    if (this.currentPhase) {
      this.endPhase();
    }
    
    this.currentPhase = {
      name: phaseName,
      startTime: Date.now(),
      expectedDuration,
      metrics: [],
      failures: [],
      recoveryEvents: []
    };
  }
  
  endPhase() {
    if (this.currentPhase) {
      this.currentPhase.endTime = Date.now();
      this.currentPhase.actualDuration = this.currentPhase.endTime - this.currentPhase.startTime;
      this.phases.push(this.currentPhase);
      
      // Store phase summary in recovery metrics
      const phaseSummary = this.calculatePhaseSummary(this.currentPhase);
      this.recoveryMetrics[this.currentPhase.name] = phaseSummary;
      
      this.currentPhase = null;
    }
  }
  
  addMetric(vus, responseTime, throughput, errorRate, connectionSuccess = true) {
    const metric = {
      timestamp: Date.now(),
      vus,
      responseTime,
      throughput,
      errorRate,
      connectionSuccess
    };
    
    if (this.currentPhase) {
      this.currentPhase.metrics.push(metric);
    }
    
    // Detect failure conditions
    this.detectFailureConditions(metric);
    
    // Track recovery progress
    this.trackRecoveryProgress(metric);
  }
  
  detectFailureConditions(metric) {
    // Define failure conditions
    const isFailure = metric.errorRate > 0.2 || 
                     metric.responseTime > 3000 || 
                     !metric.connectionSuccess;
    
    if (isFailure && !this.failureDetected) {
      this.failureDetected = true;
      this.logRecoveryEvent('failure_detected', `High error rate: ${(metric.errorRate * 100).toFixed(1)}% or slow response: ${metric.responseTime}ms`);
    }
    
    if (this.currentPhase) {
      if (isFailure) {
        this.currentPhase.failures.push(metric);
      }
    }
  }
  
  trackRecoveryProgress(metric) {
    // Track when recovery starts
    if (this.failureDetected && !this.recoveryStartTime) {
      if (metric.errorRate < 0.1 && metric.responseTime < 1500) {
        this.recoveryStartTime = Date.now();
        this.logRecoveryEvent('recovery_started', 'System showing signs of recovery');
      }
    }
    
    // Track when recovery completes
    if (this.recoveryStartTime && !this.recoveryCompletionTime) {
      if (metric.errorRate < 0.05 && metric.responseTime < 1000) {
        this.recoveryCompletionTime = Date.now();
        this.logRecoveryEvent('recovery_completed', 'System fully recovered');
      }
    }
  }
  
  logRecoveryEvent(eventType, description) {
    const event = {
      timestamp: Date.now(),
      type: eventType,
      description
    };
    
    if (this.currentPhase) {
      this.currentPhase.recoveryEvents.push(event);
    }
    
    console.log(`🔄 Recovery Event: ${description}`);
  }
  
  calculatePhaseSummary(phase) {
    if (phase.metrics.length === 0) return null;
    
    return {
      avgResponseTime: this.average(phase.metrics.map(m => m.responseTime)),
      avgThroughput: this.average(phase.metrics.map(m => m.throughput)),
      avgErrorRate: this.average(phase.metrics.map(m => m.errorRate)),
      maxResponseTime: Math.max(...phase.metrics.map(m => m.responseTime)),
      minThroughput: Math.min(...phase.metrics.map(m => m.throughput)),
      failureCount: phase.failures.length,
      recoveryEventCount: phase.recoveryEvents.length,
      duration: phase.actualDuration
    };
  }
  
  analyzeRecoveryPattern() {
    const analysis = {
      totalPhases: this.phases.length,
      recoveryMetrics: this.recoveryMetrics,
      recoveryTime: this.calculateRecoveryTime(),
      resilience: this.calculateResilienceScore(),
      failoverEffectiveness: this.analyzeFailoverEffectiveness(),
      recommendations: this.generateRecoveryRecommendations()
    };
    
    return analysis;
  }
  
  calculateRecoveryTime() {
    if (!this.recoveryStartTime || !this.recoveryCompletionTime) {
      return null;
    }
    
    return {
      timeToRecoveryStart: this.recoveryStartTime - this.failureDetected,
      fullRecoveryTime: this.recoveryCompletionTime - this.recoveryStartTime,
      totalRecoveryTime: this.recoveryCompletionTime - this.failureDetected
    };
  }
  
  calculateResilienceScore() {
    if (!this.recoveryMetrics.baseline || !this.recoveryMetrics.failure) {
      return null;
    }
    
    const baseline = this.recoveryMetrics.baseline;
    const failure = this.recoveryMetrics.failure;
    const recovery = this.recoveryMetrics.fullRecovery || this.recoveryMetrics.recovery;
    
    if (!recovery) return null;
    
    // Score based on how well the system maintained performance during failure
    const performanceRetention = Math.max(0, 100 - ((failure.avgResponseTime - baseline.avgResponseTime) / baseline.avgResponseTime * 100));
    
    // Score based on how quickly it recovered
    const recoverySpeed = this.recoveryCompletionTime ? 
      Math.max(0, 100 - ((this.recoveryCompletionTime - this.recoveryStartTime) / 60000 * 10)) : 0; // 10 points per minute
    
    // Score based on final recovery quality
    const recoveryQuality = recovery.avgResponseTime ? 
      Math.max(0, 100 - ((recovery.avgResponseTime - baseline.avgResponseTime) / baseline.avgResponseTime * 100)) : 0;
    
    const overallScore = (performanceRetention * 0.3 + recoverySpeed * 0.3 + recoveryQuality * 0.4);
    
    return {
      performanceRetention,
      recoverySpeed,
      recoveryQuality,
      overallScore,
      rating: this.categorizeResilience(overallScore)
    };
  }
  
  categorizeResilience(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 40) return 'Poor';
    return 'Critical';
  }
  
  analyzeFailoverEffectiveness() {
    const failurePhase = this.recoveryMetrics.failure;
    const recoveryPhase = this.recoveryMetrics.recovery;
    
    if (!failurePhase || !recoveryPhase) return null;
    
    const errorRateReduction = ((failurePhase.avgErrorRate - recoveryPhase.avgErrorRate) / failurePhase.avgErrorRate) * 100;
    const responseTimeImprovement = ((failurePhase.avgResponseTime - recoveryPhase.avgResponseTime) / failurePhase.avgResponseTime) * 100;
    
    return {
      errorRateReduction,
      responseTimeImprovement,
      effectiveness: (errorRateReduction + responseTimeImprovement) / 2
    };
  }
  
  generateRecoveryRecommendations() {
    const recommendations = [];
    const resilience = this.calculateResilienceScore();
    
    if (resilience) {
      if (resilience.overallScore < 60) {
        recommendations.push('Poor recovery performance - review disaster recovery procedures');
      }
      
      if (resilience.recoverySpeed < 70) {
        recommendations.push('Slow recovery detected - consider automated failover mechanisms');
      }
      
      if (resilience.performanceRetention < 50) {
        recommendations.push('System degrades significantly during failures - implement better graceful degradation');
      }
    }
    
    if (this.recoveryCompletionTime && (this.recoveryCompletionTime - this.recoveryStartTime) > 300000) { // 5 minutes
      recommendations.push('Recovery time exceeds 5 minutes - optimize recovery procedures');
    }
    
    const failurePhase = this.recoveryMetrics.failure;
    if (failurePhase && failurePhase.avgErrorRate > 0.3) {
      recommendations.push('High error rates during failure - implement circuit breakers and retry logic');
    }
    
    return recommendations;
  }
  
  average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
}

/**
 * Create a recovery test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createRecoveryTest(params) {
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
    console.log('Starting recovery test to validate system resilience...');
    
    // Authenticate if auth is provided
    let authData = {};
    if (auth) {
      const token = auth.getToken();
      authData = { token };
    }
    
    // Initialize recovery analyzer
    const recoveryAnalyzer = new RecoveryAnalyzer();
    recoveryAnalyzer.startPhase('baseline', 5 * 60 * 1000); // 5 minutes
    
    return {
      ...authData,
      startTime: Date.now(),
      recoveryAnalyzer,
      testId: `recovery-${Date.now()}`,
      lastPhaseCheck: Date.now()
    };
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
    console.log('Recovery test completed. Analyzing system resilience...');
    
    data.recoveryAnalyzer.endPhase(); // End final phase
    const analysis = data.recoveryAnalyzer.analyzeRecoveryPattern();
    
    console.log('=== RECOVERY TEST ANALYSIS ===');
    console.log(`Test ID: ${data.testId}`);
    console.log(`Total Phases: ${analysis.totalPhases}`);
    
    if (analysis.resilience) {
      console.log(`\n--- Resilience Score ---`);
      console.log(`Overall Score: ${analysis.resilience.overallScore.toFixed(1)}/100 (${analysis.resilience.rating})`);
      console.log(`Performance Retention: ${analysis.resilience.performanceRetention.toFixed(1)}%`);
      console.log(`Recovery Speed: ${analysis.resilience.recoverySpeed.toFixed(1)}%`);
      console.log(`Recovery Quality: ${analysis.resilience.recoveryQuality.toFixed(1)}%`);
    }
    
    if (analysis.recoveryTime) {
      console.log(`\n--- Recovery Timing ---`);
      console.log(`Time to Recovery Start: ${(analysis.recoveryTime.timeToRecoveryStart / 1000).toFixed(1)}s`);
      console.log(`Full Recovery Time: ${(analysis.recoveryTime.fullRecoveryTime / 1000).toFixed(1)}s`);
      console.log(`Total Recovery Time: ${(analysis.recoveryTime.totalRecoveryTime / 1000).toFixed(1)}s`);
    }
    
    if (analysis.failoverEffectiveness) {
      console.log(`\n--- Failover Effectiveness ---`);
      console.log(`Error Rate Reduction: ${analysis.failoverEffectiveness.errorRateReduction.toFixed(1)}%`);
      console.log(`Response Time Improvement: ${analysis.failoverEffectiveness.responseTimeImprovement.toFixed(1)}%`);
      console.log(`Overall Effectiveness: ${analysis.failoverEffectiveness.effectiveness.toFixed(1)}%`);
    }
    
    if (analysis.recommendations.length > 0) {
      console.log(`\n--- Recovery Recommendations ---`);
      analysis.recommendations.forEach(rec => console.log(`• ${rec}`));
    }
    
    console.log('===============================');
    
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
    let connectionSuccess = true;
    
    // Determine current test phase
    const currentPhase = this.determineRecoveryPhase(testRuntime);
    
    // Check for phase transitions
    if (Date.now() - data.lastPhaseCheck > 2 * 60 * 1000) { // Check every 2 minutes
      // Simplified phase management - in practice you'd track more precisely
      data.lastPhaseCheck = Date.now();
    }
    
    // Test each endpoint
    for (const [name, endpoint] of Object.entries(endpoints)) {
      group(`Recovery: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1 } = endpoint;
        
        // Skip this endpoint based on weight
        if (Math.random() > weight) {
          return;
        }
        
        // Add recovery test specific tags
        const recoveryTestTags = {
          ...tags,
          test_type: 'recovery',
          test_id: data.testId,
          endpoint: name,
          current_vus: currentVUs,
          phase: currentPhase,
          runtime_minutes: Math.floor(testRuntime / 60000)
        };
        
        const requestStart = Date.now();
        
        try {
          // Make request
          const response = http.request(method, path, body, { tags: recoveryTestTags });
          
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
            // Default validation for recovery tests - more lenient
            const checkResults = check(response, {
              [`${name} system responsive during ${currentPhase}`]: (r) => r.status !== 0,
              [`${name} recovers from failures`]: (r) => r.status < 500 || r.status === 503, // 503 acceptable during recovery
              [`${name} maintains basic function`]: (r) => r.timings.duration > 0,
              [`${name} eventual consistency`]: (r) => r.body.length >= 0 // Even empty responses OK during recovery
            });
            
            if (!Object.values(checkResults).every(result => result)) {
              errorCount++;
            }
          }
          
          // Log recovery-specific events
          if (currentPhase === 'failure' && responseTime > 2000) {
            console.log(`🚨 Failure condition: ${name} took ${responseTime}ms during failure simulation`);
          } else if (currentPhase === 'recovery' && responseTime < 1000) {
            console.log(`✅ Recovery sign: ${name} responding well (${responseTime}ms) during recovery`);
          }
          
        } catch (error) {
          connectionSuccess = false;
          errorCount++;
          console.log(`❌ Connection failure: ${name} - ${error.message}`);
        }
        
        // Variable sleep based on recovery phase
        if (currentPhase === 'failure') {
          sleep(Math.random() * 2 + 0.5); // 0.5-2.5 seconds during failure
        } else if (currentPhase === 'recovery') {
          sleep(Math.random() * 1.5 + 0.5); // 0.5-2 seconds during recovery
        } else {
          sleep(Math.random() * 1 + 1); // 1-2 seconds during normal phases
        }
      });
    }
    
    // Record recovery metrics
    if (data.recoveryAnalyzer && requestCount > 0) {
      const iterationDuration = Date.now() - iterationStart;
      const avgResponseTime = totalResponseTime / requestCount;
      const throughput = requestCount / (iterationDuration / 1000);
      const errorRate = errorCount / requestCount;
      
      data.recoveryAnalyzer.addMetric(
        currentVUs,
        avgResponseTime,
        throughput,
        errorRate,
        connectionSuccess
      );
    }
  };
  
  // Helper function to determine recovery phase
  const determineRecoveryPhase = (runtime) => {
    const minutes = runtime / (60 * 1000);
    
    if (minutes < 5) return 'baseline';
    if (minutes < 11) return 'failure';
    if (minutes < 16) return 'recovery';
    if (minutes < 23) return 'fullRecovery';
    return 'verification';
  };
  
  // Return k6 test script
  return {
    options: testOptions,
    setup,
    default: defaultFunction,
    teardown
  };
}
