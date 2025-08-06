import { getReportPortalConfig, createTestMetadata } from './config.js';
import { startLaunch, finishLaunch } from './launch.js';
import { RpClient } from './client.js';

/**
 * Base test lifecycle manager for k6 tests
 * Contains common functionality for HTTP and gRPC tests
 */
export class BaseLifecycleManager {
    constructor(testType, metadata = {}) {
        this.config = getReportPortalConfig();
        this.config.launch = `${this.config.launch} - ${testType}`;
        this.config.metadata = createTestMetadata(testType, metadata);
        this.testType = testType;
        this.metadata = metadata;
        this.launchData = null;
        this.client = null;
        this.suiteId = null;
        this.testResults = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0
        };
    }

    /**
     * Setup function to be called in k6 setup()
     */
    setup() {
        this.launchData = { launchId: startLaunch(this.config) };
        
        if (this.launchData && this.launchData.launchId) {
            this.client = new RpClient(this.launchData.launchId, this.config);
            this.suiteId = this.client.startSuite('Test Suite', 'Automated test suite');
        }
        
        return {
            ...this.launchData,
            suiteId: this.suiteId
        };
    }

    /**
     * Teardown function to be called in k6 teardown()
     */
    teardown(data) {
        if (data.suiteId && data.launchId) {
            try {
                const client = new RpClient(data.launchId, this.config);
                const suiteStatus = this.testResults.failed > 0 ? 'FAILED' : 'PASSED';
                client.finishSuite(data.suiteId, suiteStatus);
            } catch (error) {
                console.log('Error finishing suite:', error.message);
            }
            
            finishLaunch(data.launchId, this.config);
        }
    }

    /**
     * Update test results
     */
    updateTestResults(status) {
        this.testResults.total++;
        if (status === 'PASSED') {
            this.testResults.passed++;
        } else {
            this.testResults.failed++;
        }
    }

    /**
     * Get current test results
     */
    getTestResults() {
        return { ...this.testResults };
    }

    /**
     * Log test result to ReportPortal
     */
    logTestResult(testId, name, response, status) {
        if (this.client && testId) {
            const message = `${name} request - Status: ${response.status}, Duration: ${response.timings.duration}ms`;
            const level = status === 'PASSED' ? 'info' : 'error';
            this.client.writeLog(testId, message, level);
        }
    }

    /**
     * Log error to ReportPortal
     */
    logError(testId, name, error) {
        if (this.client && testId) {
            this.client.writeLog(testId, `Error in ${name}: ${error.message}`, 'error');
        }
    }
} 