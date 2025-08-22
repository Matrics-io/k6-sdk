/**
 * Burst test template for k6 performance testing SDK
 * 
 * A burst test simulates repeated short bursts of high load followed by
 * periods of low activity to test system recovery and resource management.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default burst test options
 * Repeated cycles of high load bursts and recovery periods
 */
const defaultOptions = {
  stages: [
    // Cycle 1: First burst
    { duration: '30s', target: 200 },  // Burst to 200 users
    { duration: '1m', target: 200 },   // Hold burst
    { duration: '30s', target: 20 },   // Drop to baseline
    { duration: '2m', target: 20 },    // Recovery period
    
    // Cycle 2: Second burst
    { duration: '30s', target: 300 },  // Burst to 300 users
    { duration: '1m', target: 300 },   // Hold burst
    { duration: '30s', target: 20 },   // Drop to baseline
    { duration: '2m', target: 20 },    // Recovery period
    
    // Cycle 3: Third burst
    { duration: '30s', target: 400 },  // Burst to 400 users
    { duration: '1m', target: 400 },   // Hold burst
    { duration: '30s', target: 20 },   // Drop to baseline
    { duration: '2m', target: 20 },    // Recovery period
    
    // Cycle 4: Final burst
    { duration: '30s', target: 500 },  // Burst to 500 users
    { duration: '1m', target: 500 },   // Hold burst
    { duration: '30s', target: 0 }     // Complete ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.08'],    // Allow higher error rate during bursts
    http_reqs: ['rate>20'],            // Minimum throughput
    vus_max: ['value<=500'],           // Maximum VUs for burst test
    // Burst-specific thresholds
    http_req_waiting: ['p(95)<1200'],  // Server processing time
    checks: ['rate>=0.90']             // 90% success rate during bursts
  },
  // Extended timeouts for burst conditions
  setupTimeout: '60s',
  teardownTimeout: '60s'
};

/**
 * Burst pattern analyzer
 */
class BurstPatternAnalyzer {
  constructor() {
    this.cycles = [];
    this.currentCycle = null;
    this.cycleStartTime = null;
  }
  
  startCycle(cycleNumber, targetVUs) {
    this.currentCycle = {
      number: cycleNumber,
      targetVUs: targetVUs,
      startTime: Date.now(),
      burstMetrics: [],
      recoveryMetrics: [],
      phase: 'burst'
    };
  }
  
  addMetric(vus, responseTime, throughput, errorRate, phase) {
    if (!this.currentCycle) return;
    
    const metric = {
      vus,
      responseTime,
      throughput,
      errorRate,
      timestamp: Date.now()
    };
    
    if (phase === 'burst') {
      this.currentCycle.burstMetrics.push(metric);
    } else if (phase === 'recovery') {
      this.currentCycle.recoveryMetrics.push(metric);
    }
  }
  
  endCycle() {
    if (this.currentCycle) {
      this.currentCycle.endTime = Date.now();
      this.currentCycle.duration = this.currentCycle.endTime - this.currentCycle.startTime;
      this.cycles.push(this.currentCycle);
      this.currentCycle = null;
    }
  }
  
  analyzeBurstPattern() {
    if (this.cycles.length === 0) return null;
    
    const analysis = {
      totalCycles: this.cycles.length,
      cycles: [],
      trends: {},
      recommendations: []
    };
    
    this.cycles.forEach(cycle => {
      const burstAvg = this.calculateAverages(cycle.burstMetrics);
      const recoveryAvg = this.calculateAverages(cycle.recoveryMetrics);
      
      const cycleAnalysis = {
        number: cycle.number,
        targetVUs: cycle.targetVUs,
        duration: cycle.duration,
        burst: burstAvg,
        recovery: recoveryAvg,
        recoveryEffectiveness: this.calculateRecoveryEffectiveness(burstAvg, recoveryAvg)
      };
      
      analysis.cycles.push(cycleAnalysis);
    });
    
    // Analyze trends across cycles
    analysis.trends = this.analyzeCycleTrends(analysis.cycles);
    analysis.recommendations = this.generateRecommendations(analysis);
    
    return analysis;
  }
  
  calculateAverages(metrics) {
    if (metrics.length === 0) return null;
    
    return {
      avgResponseTime: this.average(metrics.map(m => m.responseTime)),
      avgThroughput: this.average(metrics.map(m => m.throughput)),
      avgErrorRate: this.average(metrics.map(m => m.errorRate)),
      maxResponseTime: Math.max(...metrics.map(m => m.responseTime)),
      sampleCount: metrics.length
    };
  }
  
  calculateRecoveryEffectiveness(burst, recovery) {
    if (!burst || !recovery) return null;
    
    const responseTimeRecovery = ((burst.avgResponseTime - recovery.avgResponseTime) / burst.avgResponseTime) * 100;
    const errorRateRecovery = ((burst.avgErrorRate - recovery.avgErrorRate) / Math.max(burst.avgErrorRate, 0.01)) * 100;
    
    return {
      responseTimeImprovement: responseTimeRecovery,
      errorRateImprovement: errorRateRecovery,
      overallScore: (responseTimeRecovery + errorRateImprovement) / 2
    };
  }
  
  analyzeCycleTrends(cycles) {
    const trends = {
      burstDegradation: [],
      recoveryEfficiency: [],
      systemStability: 'stable'
    };
    
    for (let i = 1; i < cycles.length; i++) {
      const current = cycles[i];
      const previous = cycles[i - 1];
      
      if (current.burst && previous.burst) {
        const degradation = ((current.burst.avgResponseTime - previous.burst.avgResponseTime) / previous.burst.avgResponseTime) * 100;
        trends.burstDegradation.push(degradation);
      }
      
      if (current.recoveryEffectiveness && current.recoveryEffectiveness.overallScore < 50) {
        trends.systemStability = 'degrading';
      }
    }
    
    return trends;
  }
  
  generateRecommendations(analysis) {
    const recommendations = [];
    
    const lastCycle = analysis.cycles[analysis.cycles.length - 1];
    if (lastCycle && lastCycle.burst) {
      if (lastCycle.burst.avgResponseTime > 2000) {
        recommendations.push('Consider reducing burst intensity - response times exceed 2s');
      }
      
      if (lastCycle.burst.avgErrorRate > 0.1) {
        recommendations.push('High error rate during bursts - investigate system capacity');
      }
    }
    
    if (analysis.trends.systemStability === 'degrading') {
      recommendations.push('System shows degradation across burst cycles - review resource allocation');
    }
    
    const avgRecoveryScore = analysis.cycles
      .filter(c => c.recoveryEffectiveness)
      .reduce((sum, c) => sum + c.recoveryEffectiveness.overallScore, 0) / analysis.cycles.length;
    
    if (avgRecoveryScore < 60) {
      recommendations.push('Recovery periods may need to be longer for optimal performance');
    }
    
    return recommendations;
  }
  
  average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
}

/**
 * Create a burst test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createBurstTest(params) {
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
    console.log('Starting burst test to analyze system recovery patterns...');
    
    // Authenticate if auth is provided
    let authData = {};
    if (auth) {
      const token = auth.getToken();
      authData = { token };
    }
    
    // Initialize burst pattern analyzer
    const burstAnalyzer = new BurstPatternAnalyzer();
    
    return {
      ...authData,
      startTime: Date.now(),
      burstAnalyzer,
      testId: `burst-${Date.now()}`,
      currentCycleNumber: 0
    };
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
    console.log('Burst test completed. Analyzing burst patterns...');
    
    const testDuration = (Date.now() - data.startTime) / 1000;
    const analysis = data.burstAnalyzer.analyzeBurstPattern();
    
    console.log('=== BURST TEST ANALYSIS ===');
    console.log(`Test ID: ${data.testId}`);
    console.log(`Duration: ${testDuration} seconds`);
    
    if (analysis) {
      console.log(`Total Burst Cycles: ${analysis.totalCycles}`);
      
      console.log('\n--- Cycle Performance ---');
      analysis.cycles.forEach(cycle => {
        console.log(`Cycle ${cycle.number} (${cycle.targetVUs} VUs):`);
        if (cycle.burst) {
          console.log(`  Burst: ${cycle.burst.avgResponseTime.toFixed(0)}ms avg, ${(cycle.burst.avgErrorRate * 100).toFixed(1)}% errors`);
        }
        if (cycle.recovery) {
          console.log(`  Recovery: ${cycle.recovery.avgResponseTime.toFixed(0)}ms avg, ${(cycle.recovery.avgErrorRate * 100).toFixed(1)}% errors`);
        }
        if (cycle.recoveryEffectiveness) {
          console.log(`  Recovery Score: ${cycle.recoveryEffectiveness.overallScore.toFixed(1)}/100`);
        }
      });
      
      if (analysis.recommendations.length > 0) {
        console.log('\n--- Recommendations ---');
        analysis.recommendations.forEach(rec => console.log(`• ${rec}`));
      }
    }
    
    console.log('===========================');
    
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
    const iterationStart = Date.now();
    let requestCount = 0;
    let errorCount = 0;
    let totalResponseTime = 0;
    
    // Determine current phase and cycle
    const phase = currentVUs > 50 ? 'burst' : 'recovery';
    const cycleNumber = Math.floor((Date.now() - data.startTime) / (8 * 60 * 1000)) + 1; // 8-minute cycles
    
    // Track cycle changes
    if (cycleNumber !== data.currentCycleNumber) {
      if (data.currentCycleNumber > 0) {
        data.burstAnalyzer.endCycle();
      }
      data.burstAnalyzer.startCycle(cycleNumber, currentVUs);
      data.currentCycleNumber = cycleNumber;
    }
    
    // Test each endpoint
    for (const [name, endpoint] of Object.entries(endpoints)) {
      group(`Burst Test: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1 } = endpoint;
        
        // Skip this endpoint based on weight
        if (Math.random() > weight) {
          return;
        }
        
        // Add burst test specific tags
        const burstTestTags = {
          ...tags,
          test_type: 'burst',
          test_id: data.testId,
          endpoint: name,
          phase: phase,
          cycle: cycleNumber,
          current_vus: currentVUs
        };
        
        const requestStart = Date.now();
        
        // Make request
        const response = http.request(method, path, body, { tags: burstTestTags });
        
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
          // Default validation for burst tests
          const checkResults = check(response, {
            [`${name} system responsive during ${phase}`]: (r) => r.status !== 0 && r.timings.duration > 0,
            [`${name} acceptable for burst conditions`]: (r) => 
              phase === 'burst' ? r.timings.duration < 3000 : r.timings.duration < 1000,
            [`${name} no complete failures`]: (r) => r.status !== 502 && r.status !== 503,
            [`${name} content delivered`]: (r) => r.body.length > 0
          });
          
          if (!Object.values(checkResults).every(result => result)) {
            errorCount++;
          }
        }
        
        // Log burst vs recovery performance
        if (phase === 'burst' && responseTime > 2000) {
          console.log(`💥 Burst impact: ${name} took ${responseTime}ms at ${currentVUs} VUs`);
        } else if (phase === 'recovery' && responseTime < 500) {
          console.log(`🔄 Good recovery: ${name} back to ${responseTime}ms`);
        }
        
        // Phase-appropriate sleep
        if (phase === 'burst') {
          sleep(Math.random() * 0.5 + 0.2); // 0.2-0.7 seconds during burst
        } else {
          sleep(Math.random() * 2 + 1); // 1-3 seconds during recovery
        }
      });
    }
    
    // Record burst pattern metrics
    if (data.burstAnalyzer && requestCount > 0) {
      const iterationDuration = Date.now() - iterationStart;
      const avgResponseTime = totalResponseTime / requestCount;
      const throughput = requestCount / (iterationDuration / 1000);
      const errorRate = errorCount / requestCount;
      
      data.burstAnalyzer.addMetric(
        currentVUs,
        avgResponseTime,
        throughput,
        errorRate,
        phase
      );
    }
  };
  
  // Return k6 test script
  return {
    options: testOptions,
    setup,
    default: defaultFunction,
    teardown
  };
}
