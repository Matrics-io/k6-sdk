/**
 * ReportPortal Utilities Module
 * Common helper functions and utilities
 */

/**
 * This will create header with authorization token.
 * @param {string} token 
 * @returns {object} Headers object
 */
export function getHeader(token) {
    return {
        headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${token}`,
        },
    };
}

/**
 * Validate if ReportPortal is enabled and configured
 * @param {object} reporterOptions - ReportPortal options
 * @returns {boolean} Whether ReportPortal is properly configured
 */
export function isReportPortalEnabled(reporterOptions) {
    return reporterOptions.publishResult && 
           reporterOptions.token && 
           reporterOptions.endpoint;
}

/**
 * Log ReportPortal message with optional debug level
 * @param {string} message - Message to log
 * @param {boolean} debug - Whether this is a debug message
 */
export function logReportPortal(message, debug = false) {
    if (debug && __ENV.RP_DEBUG !== 'true') {
        return;
    }
    console.log(`ReportPortal: ${message}`);
} 