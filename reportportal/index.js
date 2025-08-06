/**
 * ReportPortal Module Index
 * Main entry point for all ReportPortal functionality
 */

// Export configuration and setup functions
export { getReportPortalConfig, createTestMetadata } from './config.js';

// Export utility functions
export { getHeader, isReportPortalEnabled, logReportPortal } from './utils.js';

// Export launch functions
export { startLaunch, finishLaunch } from './launch.js';

// Export client class
export { RpClient } from './client.js';

// Export lifecycle managers
export { BaseLifecycleManager } from './base-lifecycle-manager.js';
export { TestLifecycleManager } from './lifecycle-manager.js';
export { GrpcTestLifecycleManager } from './grpc-lifecycle-manager.js';

// Export test factory functions
export { createReportPortalTest, createGrpcReportPortalTest } from './test-factory.js'; 