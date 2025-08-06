import { check } from 'k6';
import { BaseLifecycleManager } from './base-lifecycle-manager.js';
import { RpClient } from './client.js';

/**
 * gRPC test lifecycle manager for k6 tests
 * Handles gRPC endpoint testing with ReportPortal integration
 */
export class GrpcTestLifecycleManager extends BaseLifecycleManager {
    constructor(testType, metadata = {}) {
        super(testType, metadata);
    }

    /**
     * Generic gRPC endpoint tester
     */
    testGrpcEndpoints(data, endpoints, config, grpcClient, customChecks = null) {
        if (!data || !data.launchId) return;

        if (!this.client && data.launchId) {
            this.client = new RpClient(data.launchId, this.config);
        }

        for (const [name, endpoint] of Object.entries(endpoints)) {
            this.testSingleGrpcEndpoint(data, name, endpoint, config, grpcClient, customChecks);
        }
    }

    /**
     * Test a single gRPC endpoint
     */
    testSingleGrpcEndpoint(data, name, endpoint, config, grpcClient, customChecks = null) {
        let testId = null;
        if (this.client && data.suiteId) {
            testId = this.client.startTest(data.suiteId, `${name} Test`, endpoint.description || `Testing ${name}`);
        }

        try {
            const response = this.makeGrpcRequest(endpoint, grpcClient);
            const checks = this.validateGrpcResponse(response, name, customChecks);
            const status = checks ? 'PASSED' : 'FAILED';
            
            this.logGrpcTestResult(testId, name, response, status);
            this.client?.finishTest(testId, status);
            this.updateTestResults(status);

        } catch (error) {
            this.logGrpcError(testId, name, error);
            this.client?.finishTest(testId, 'FAILED');
            this.updateTestResults('FAILED');
            throw error;
        }
    }

    /**
     * Make gRPC request based on endpoint configuration
     */
    makeGrpcRequest(endpoint, grpcClient) {
        if (!grpcClient) {
            console.log('gRPC client not available, skipping request');
            return null;
        }
        
        const methodName = endpoint.path || endpoint.method;
        const requestData = endpoint.requestData || {};
        
        try {
            return grpcClient.invoke(methodName, requestData);
        } catch (error) {
            console.log(`gRPC request failed for ${methodName}:`, error.message);
            return null;
        }
    }

    validateGrpcResponse(response, name, customChecks = null) {
        const defaultChecks = {
            [`${name} works`]: (r) => r !== undefined && r !== null
        };

        const checks = customChecks ? { ...defaultChecks, ...customChecks } : defaultChecks;
        
        if (response === null) return false;
        return check(response, checks);
    }

    logGrpcTestResult(testId, name, response, status) {
        if (this.client && testId) {
            const message = `${name} gRPC call - Status: ${status}, Response: ${response !== undefined ? 'Success' : 'Failed'}`;
            const level = status === 'PASSED' ? 'info' : 'error';
            this.client.writeLog(testId, message, level);
        }
    }

    logGrpcError(testId, name, error) {
        if (this.client && testId) {
            this.client.writeLog(testId, `Error in ${name}: ${error.message}`, 'error');
        }
    }
} 