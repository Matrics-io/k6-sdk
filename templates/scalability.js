/**
 * Scalability test template for k6 performance testing SDK
 * 
 * A scalability test validates how well the system scales with increased
 * resources and load, testing both horizontal and vertical scaling scenarios.
 */

import { sleep } from 'k6';
import { check, group } from 'k6';

/**
 * Default scalability test options
 * Progressive load increase to test scaling effectiveness
 */
const defaultOptions = {
  stages: [
    // Baseline measurement
    { duration: '2m', target: 50 },    // Baseline with 50 users
    { duration: '3m', target: 50 },    // Sustain baseline
    
    // Scale test 1: Double the load
    { duration: '2m', target: 100 },   // Scale to 100 users
    { duration: '5m', target: 100 },   // Sustain to measure scaling
    
    // Scale test 2: Triple the load
    { duration: '2m', target: 150 },   // Scale to 150 users
    { duration: '5m', target: 150 },   // Sustain to measure scaling
    
    // Scale test 3: Quadruple the load
    { duration: '2m', target: 200 },   // Scale to 200 users
    { duration: '5m', target: 200 },   // Sustain to measure scaling
    
    // Scale test 4: 5x the load
    { duration: '2m', target: 250 },   // Scale to 250 users
    { duration: '5m', target: 250 },   // Sustain to measure scaling
    
    // Scale test 5: 6x the load
    { duration: '2m', target: 300 },   // Scale to 300 users
    { duration: '5m', target: 300 },   // Sustain to measure scaling
    
    { duration: '2m', target: 0 }      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>30'],           // Minimum throughput scaling
    vus_max: ['value<=300'],          // Maximum VUs for scalability test
    // Scalability-specific thresholds
    http_req_waiting: ['p(95)<1200'], // Server processing time
    checks: ['rate>=0.95']            // High success rate expected
  },
  // Standard timeouts
  setupTimeout: '90s',
  teardownTimeout: '90s'
};

/**
 * Scalability analyzer for measuring scaling efficiency
 */
class ScalabilityAnalyzer {
  constructor() {
    this.scalingPoints = [];
    this.baselineMetrics = null;
    this.scalingEfficiency = {};
  }
  
  setBaseline(vus, responseTime, throughput, errorRate) {
    this.baselineMetrics = {
      vus,
      responseTime,
      throughput,
      errorRate,
      timestamp: Date.now()
    };
  }
  
  addScalingPoint(vus, responseTime, throughput, errorRate, resourceMetrics = {}) {
    const scalingPoint = {
      vus,
      responseTime,
      throughput,
      errorRate,
      resourceMetrics,
      timestamp: Date.now()
    };
    
    if (this.baselineMetrics) {
      scalingPoint.scaling = this.calculateScalingMetrics(scalingPoint);
    }
    
    this.scalingPoints.push(scalingPoint);
  }
  
  calculateScalingMetrics(current) {
    if (!this.baselineMetrics) return null;
    
    const baseline = this.baselineMetrics;
    const loadMultiplier = current.vus / baseline.vus;
    const throughputMultiplier = current.throughput / baseline.throughput;
    const responseTimeMultiplier = current.responseTime / baseline.responseTime;
    
    // Linear scaling efficiency (ideal = 100%)
    const linearEfficiency = (throughputMultiplier / loadMultiplier) * 100;
    
    // Performance degradation
    const performanceDegradation = ((current.responseTime - baseline.responseTime) / baseline.responseTime) * 100;
    
    // Overall scaling score
    const scalingScore = Math.max(0, linearEfficiency - (performanceDegradation / 2));
    
    return {
      loadMultiplier,
      throughputMultiplier,
      responseTimeMultiplier,
      linearEfficiency,
      performanceDegradation,
      scalingScore,
      scalingCategory: this.categorizeScaling(scalingScore)
    };
  }
  
  categorizeScaling(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 40) return 'Poor';
    return 'Failing';
  }
  
  analyzeScalabilityPattern() {
    if (this.scalingPoints.length < 2) return null;
    
    const analysis = {
      baseline: this.baselineMetrics,
      scalingPoints: this.scalingPoints.length,
      maxScale: Math.max(...this.scalingPoints.map(p => p.vus / this.baselineMetrics.vus)),
      scalingTrend: this.calculateScalingTrend(),
      bottlenecks: this.identifyBottlenecks(),
      recommendations: this.generateScalingRecommendations()
    };
    
    return analysis;
  }
  
  calculateScalingTrend() {
    const validPoints = this.scalingPoints.filter(p => p.scaling);
    if (validPoints.length < 2) return null;
    
    // Calculate trend in scaling efficiency
    const efficiencyTrend = validPoints.map(p => p.scaling.linearEfficiency);
    const isImproving = efficiencyTrend[efficiencyTrend.length - 1] > efficiencyTrend[0];
    const avgEfficiency = efficiencyTrend.reduce((a, b) => a + b, 0) / efficiencyTrend.length;
    
    // Calculate trend in response time
    const responseTimes = validPoints.map(p => p.responseTime);
    const responseTimeGrowth = ((responseTimes[responseTimes.length - 1] - responseTimes[0]) / responseTimes[0]) * 100;
    
    return {
      isImproving,
      avgEfficiency,
      responseTimeGrowth,
      sustainableScale: this.findSustainableScale(validPoints)
    };
  }
  
  findSustainableScale(points) {
    // Find the highest scale where efficiency is still above 70%
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].scaling.linearEfficiency >= 70) {
        return {
          vus: points[i].vus,
          multiplier: points[i].scaling.loadMultiplier,
          efficiency: points[i].scaling.linearEfficiency
        };
      }
    }
    return null;
  }
  
  identifyBottlenecks() {
    const bottlenecks = [];
    
    // Check for response time bottlenecks
    const responseTimeIncreases = this.scalingPoints
      .filter(p => p.scaling)
      .map(p => p.scaling.performanceDegradation);
    
    if (responseTimeIncreases.some(increase => increase > 100)) {
      bottlenecks.push({
        type: 'response_time',
        severity: 'high',
        description: 'Response time increases significantly with load'
      });
    }
    
    // Check for throughput bottlenecks
    const throughputEfficiencies = this.scalingPoints
      .filter(p => p.scaling)
      .map(p => p.scaling.linearEfficiency);
    
    if (throughputEfficiencies.some(eff => eff < 50)) {
      bottlenecks.push({
        type: 'throughput',
        severity: 'high',
        description: 'Throughput does not scale linearly with load'
      });
    }
    
    // Check for error rate bottlenecks
    const errorRates = this.scalingPoints.map(p => p.errorRate);
    if (errorRates.some(rate => rate > 0.05)) {
      bottlenecks.push({
        type: 'reliability',
        severity: 'medium',
        description: 'Error rates increase under higher load'
      });
    }
    
    return bottlenecks;
  }
  
  generateScalingRecommendations() {
    const recommendations = [];
    const trend = this.calculateScalingTrend();
    const bottlenecks = this.identifyBottlenecks();
    
    if (trend && trend.avgEfficiency < 70) {
      recommendations.push('Poor scaling efficiency detected - consider horizontal scaling or resource optimization');
    }
    
    if (trend && trend.responseTimeGrowth > 150) {
      recommendations.push('Response time grows too quickly with load - investigate server-side bottlenecks');
    }
    
    if (bottlenecks.some(b => b.type === 'throughput')) {
      recommendations.push('Throughput bottleneck detected - check database connections, CPU, or I/O limits');
    }
    
    if (bottlenecks.some(b => b.type === 'response_time')) {
      recommendations.push('Response time bottleneck - consider caching, CDN, or application optimization');
    }
    
    if (trend && trend.sustainableScale) {
      recommendations.push(`Recommended operational scale: ${trend.sustainableScale.vus} VUs (${trend.sustainableScale.multiplier.toFixed(1)}x baseline)`);
    }
    
    return recommendations;
  }
}

/**
 * Create a scalability test
 * @param {Object} params - Test parameters
 * @param {Object} params.config - Test configuration
 * @param {Object} params.http - HTTP client
 * @param {Object} [params.auth] - Authentication manager
 * @param {Object} [params.endpoints] - Endpoints to test
 * @param {Object} [params.options] - k6 options
 * @returns {Object} k6 test script
 */
export default function createScalabilityTest(params) {
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
    console.log('Starting scalability test to analyze scaling characteristics...');
    
    // Authenticate if auth is provided
    let authData = {};
    if (auth) {
      const token = auth.getToken();
      authData = { token };
    }
    
    // Initialize scalability analyzer
    const scalabilityAnalyzer = new ScalabilityAnalyzer();
    
    return {
      ...authData,
      startTime: Date.now(),
      scalabilityAnalyzer,
      testId: `scalability-${Date.now()}`,
      baselineSet: false
    };
  };
  
  // Teardown function - runs once at the end of the test
  const teardown = (data) => {
    console.log('Scalability test completed. Analyzing scaling performance...');
    
    const testDuration = (Date.now() - data.startTime) / 1000;
    const analysis = data.scalabilityAnalyzer.analyzeScalabilityPattern();
    
    console.log('=== SCALABILITY ANALYSIS ===');
    console.log(`Test ID: ${data.testId}`);
    console.log(`Duration: ${testDuration} seconds`);
    
    if (analysis) {
      console.log(`\nBaseline: ${analysis.baseline.vus} VUs, ${analysis.baseline.throughput.toFixed(1)} req/s`);
      console.log(`Max Scale Tested: ${analysis.maxScale.toFixed(1)}x baseline`);
      console.log(`Scaling Points: ${analysis.scalingPoints}`);
      
      if (analysis.scalingTrend) {
        console.log(`\n--- Scaling Performance ---`);
        console.log(`Average Efficiency: ${analysis.scalingTrend.avgEfficiency.toFixed(1)}%`);
        console.log(`Response Time Growth: ${analysis.scalingTrend.responseTimeGrowth.toFixed(1)}%`);
        console.log(`Trend: ${analysis.scalingTrend.isImproving ? 'Improving' : 'Degrading'}`);
        
        if (analysis.scalingTrend.sustainableScale) {
          const sustainable = analysis.scalingTrend.sustainableScale;
          console.log(`Sustainable Scale: ${sustainable.vus} VUs (${sustainable.multiplier.toFixed(1)}x, ${sustainable.efficiency.toFixed(1)}% efficient)`);
        }
      }
      
      if (analysis.bottlenecks.length > 0) {
        console.log(`\n--- Identified Bottlenecks ---`);
        analysis.bottlenecks.forEach(bottleneck => {
          console.log(`${bottleneck.severity.toUpperCase()}: ${bottleneck.description}`);
        });
      }
      
      if (analysis.recommendations.length > 0) {
        console.log(`\n--- Scaling Recommendations ---`);
        analysis.recommendations.forEach(rec => console.log(`• ${rec}`));
      }
    }
    
    console.log('============================');
    
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
    
    // Test each endpoint
    for (const [name, endpoint] of Object.entries(endpoints)) {
      group(`Scalability: ${name}`, () => {
        // Get endpoint details
        const { method = 'GET', path, body, validate, tags = {}, weight = 1 } = endpoint;
        
        // Skip this endpoint based on weight
        if (Math.random() > weight) {
          return;
        }
        
        // Add scalability test specific tags
        const scalabilityTestTags = {
          ...tags,
          test_type: 'scalability',
          test_id: data.testId,
          endpoint: name,
          current_vus: currentVUs,
          scale_level: currentVUs <= 50 ? 'baseline' :
                      currentVUs <= 100 ? '2x' :
                      currentVUs <= 150 ? '3x' :
                      currentVUs <= 200 ? '4x' :
                      currentVUs <= 250 ? '5x' : '6x'
        };
        
        const requestStart = Date.now();
        
        // Make request
        const response = http.request(method, path, body, { tags: scalabilityTestTags });
        
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
          // Default validation for scalability tests
          const checkResults = check(response, {
            [`${name} scales successfully`]: (r) => r.status >= 200 && r.status < 300,
            [`${name} maintains performance`]: (r) => r.timings.duration < 2000,
            [`${name} handles increased load`]: (r) => r.status !== 503 && r.status !== 502,
            [`${name} stable under scale`]: (r) => r.body.length > 0
          });
          
          if (!Object.values(checkResults).every(result => result)) {
            errorCount++;
          }
        }
        
        // Log scaling performance
        if (currentVUs >= 200 && responseTime > 1500) {
          console.log(`📊 Scaling impact: ${name} took ${responseTime}ms at ${currentVUs} VUs`);
        }
        
        // Consistent sleep for scalability measurement
        sleep(1 + Math.random() * 0.5); // 1-1.5 seconds
      });
    }
    
    // Record scalability metrics
    if (data.scalabilityAnalyzer && requestCount > 0) {
      const iterationDuration = Date.now() - iterationStart;
      const avgResponseTime = totalResponseTime / requestCount;
      const throughput = requestCount / (iterationDuration / 1000);
      const errorRate = errorCount / requestCount;
      
      // Set baseline on first stable measurement
      if (!data.baselineSet && currentVUs === 50 && __ITER > 10) {
        data.scalabilityAnalyzer.setBaseline(currentVUs, avgResponseTime, throughput, errorRate);
        data.baselineSet = true;
        console.log(`📊 Baseline set: ${currentVUs} VUs, ${throughput.toFixed(1)} req/s, ${avgResponseTime.toFixed(0)}ms`);
      }
      
      // Record scaling points for sustained periods
      if (data.baselineSet && __ITER % 20 === 0) { // Every 20th iteration
        data.scalabilityAnalyzer.addScalingPoint(currentVUs, avgResponseTime, throughput, errorRate);
      }
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
