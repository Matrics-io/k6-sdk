/**
 * ReportPortal Configuration Module
 * Handles all configuration and environment variable management
 */

/**
 * Centralized ReportPortal Configuration
 * Dynamic configuration from environment variables
 */
export function getReportPortalConfig() {
    const config = {
        endpoint: __ENV.RP_BASE_URL,
        project: __ENV.RP_PROJECT,
        token: __ENV.RP_API_TOKEN,
        launch: __ENV.RP_LAUNCH_NAME,
        publishResult: __ENV.RP_ENABLED === 'true' || __ENV.RP_ENABLED === true,
        debug: __ENV.RP_DEBUG === 'true' || __ENV.RP_DEBUG === true
    };

    return config;
}

/**
 * Helper function to create metadata for tests
 * @param {string} testType - The type of test (smoke, load, stress)
 * @param {object} metadata - Additional metadata for the launch
 * @returns {object} - Metadata object
 */
export function createTestMetadata(testType = 'smoke', metadata = {}) {
    // Hardcoded metadata for performance tests (like integration tests)
    const defaultMetadata = {
        framework: 'k6',
        language: 'javascript',
        test_type: 'performance',
        platform: 'platform',
        module: __ENV.RP_MODULE_NAME || 'performance-tests',
        total_specs: 0,
        passed_specs: 0,
        failed_specs: 0,
        skipped_specs: 0,
        duration: 0
    };
    
    // Merge with provided metadata
    return { ...defaultMetadata, ...metadata };
} 