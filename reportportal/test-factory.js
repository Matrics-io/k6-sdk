import { TestLifecycleManager } from './lifecycle-manager.js';
import { GrpcTestLifecycleManager } from './grpc-lifecycle-manager.js';
import grpc from 'k6/net/grpc';
import { sleep } from 'k6';

/**
 * Create metadata for test
 */
function createTestMetadata(testType, metadata, moduleName) {
    return {
        test_type: 'performance',
        module: moduleName,
        total_specs: 0,
        passed_specs: 0,
        failed_specs: 0,
        skipped_specs: 0,
        ...metadata
    };
}

/**
 * Helper function to create a complete test with ReportPortal integration
 */
export function createReportPortalTest(testType, endpoints, config, metadata = {}) {
    const lifecycleManager = new TestLifecycleManager(testType, 
        createTestMetadata(testType, metadata, metadata.module || 'performance-tests'));

    return {
        options: metadata.testOptions || {},
        setup: () => lifecycleManager.setup(),
        teardown: (data) => lifecycleManager.teardown(data),
        default: function(data) {
            lifecycleManager.testEndpoints(data, endpoints, config);
        }
    };
}

/**
 * Helper function to create a complete gRPC test with ReportPortal integration
 */
export function createGrpcReportPortalTest(testType, endpoints, config, metadata = {}) {
    const lifecycleManager = new GrpcTestLifecycleManager(testType, 
        createTestMetadata(testType, metadata, metadata.module || 'grpc-performance-tests'));

    return {
        options: metadata.testOptions || {},
        setup: () => lifecycleManager.setup(),
        teardown: (data) => lifecycleManager.teardown(data),
        default: function(data) {
            try {
                const client = new grpc.Client();
                const grpcHost = config.baseUrl.replace('grpc://', '');
                client.connect(grpcHost, { plaintext: true, reflect: true });
                lifecycleManager.testGrpcEndpoints(data, endpoints, config, client);
            } catch (error) {
                console.log('gRPC connection error:', error.message);
                lifecycleManager.testGrpcEndpoints(data, endpoints, config, null);
            }
            sleep(1 + Math.random());
        }
    };
} 