import { check } from 'k6';
import { BaseLifecycleManager } from './base-lifecycle-manager.js';
import { RpClient } from './client.js';

/**
 * HTTP test lifecycle manager for k6 tests
 * Handles HTTP endpoint testing with ReportPortal integration
 */
export class TestLifecycleManager extends BaseLifecycleManager {
    constructor(testType, metadata = {}) {
        super(testType, metadata);
    }

    /**
     * Generic endpoint tester
     */
    testEndpoints(data, endpoints, config, customChecks = null) {
        if (!data || !data.launchId) return;

        if (!this.client && data.launchId) {
            this.client = new RpClient(data.launchId, this.config);
        }

        for (const [name, endpoint] of Object.entries(endpoints)) {
            this.testSingleEndpoint(data, name, endpoint, config, customChecks);
        }
    }

    /**
     * Test a single endpoint
     */
    testSingleEndpoint(data, name, endpoint, config, customChecks = null) {
        let testId = null;
        if (this.client && data.suiteId) {
            testId = this.client.startTest(data.suiteId, `${name} Test`, endpoint.description);
        }

        try {
            const response = this.makeRequest(endpoint, config);
            const checks = this.validateResponse(response, name, customChecks);
            const status = checks ? 'PASSED' : 'FAILED';
            
            this.logTestResult(testId, name, response, status);
            this.client?.finishTest(testId, status);
            this.updateTestResults(status);

        } catch (error) {
            this.logError(testId, name, error);
            this.client?.finishTest(testId, 'FAILED');
            this.updateTestResults('FAILED');
            throw error;
        }
    }

    /**
     * Make HTTP request based on endpoint configuration
     */
    makeRequest(endpoint, config) {
        const baseUrl = config.config?.baseUrl || config.baseUrl;
        const auth = config.config?.auth || config.auth;
        
        const url = `${baseUrl}${endpoint.path}`;
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        if (auth && auth.token) {
            headers['Authorization'] = `Bearer ${auth.token}`;
        }

        return http.get(url, { headers });
    }

    /**
     * Validate HTTP response
     */
    validateResponse(response, name, customChecks = null) {
        const defaultChecks = {
            [`${name} returns 2xx`]: (r) => r.status >= 200 && r.status < 300,
            [`${name} response time < 1000ms`]: (r) => r.timings.duration < 1000
        };

        const checks = customChecks ? { ...defaultChecks, ...customChecks } : defaultChecks;
        return check(response, checks);
    }
}

// Import http for makeRequest method
import http from 'k6/http'; 