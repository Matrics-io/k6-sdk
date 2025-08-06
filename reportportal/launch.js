import http from 'k6/http';
import { getHeader, isReportPortalEnabled, logReportPortal } from './utils.js';

/**
 * This will create launch in our reportportal project
 * @param {object} reporterOptions 
 * @returns {string|null} Launch ID or null if failed
 */
export function startLaunch(reporterOptions) {
    if (!isReportPortalEnabled(reporterOptions)) {
        if (!reporterOptions.publishResult) {
            logReportPortal('publishResult is false, skipping launch creation');
        } else if (!reporterOptions.token) {
            logReportPortal('No token provided, skipping launch creation');
        } else if (!reporterOptions.endpoint) {
            logReportPortal('No endpoint provided, skipping launch creation');
        }
        return null;
    }
    
    const reportPortalUri = `${reporterOptions.endpoint}/api/v1/${reporterOptions.project}`;
    const payload = {
        'name': reporterOptions.launch || 'K6 Load Test',
        'startTime': Date.now(),
        'attributes': [{ 'key': 'build', 'value': '0.1' }, { 'value': 'test' }]
    };
    
    logReportPortal(`Creating launch at ${reportPortalUri}`);
    
    const response = http.post(`${reportPortalUri}/launch`, JSON.stringify(payload), getHeader(reporterOptions.token));
    
    logReportPortal(`Launch creation response status: ${response.status}`);
    
    if (response.status !== 201 && response.status !== 200) {
        logReportPortal(`Failed to create launch. Status: ${response.status}, Body: ${response.body}`);
        return null;
    }
    
    try {
        const result = JSON.parse(response.body);
        logReportPortal(`Launch created successfully with ID: ${result.id}`);
        return result.id;
    } catch (e) {
        logReportPortal(`Failed to parse launch response: ${e.message}`);
        return null;
    }
}

/**
 * This will finish launch created by startLaunch
 * @param {string} launchId 
 * @param {object} reporterOptions 
 * @returns {object|null} Result object or null if failed
 */
export function finishLaunch(launchId, reporterOptions) {
    if (!reporterOptions.publishResult) {
        return null;
    }
    
    const reportPortalUri = `${reporterOptions.endpoint}/api/v1/${reporterOptions.project}`;
    const payload = {
        'endTime': Date.now()
    };
    
    try {
        const response = http.put(`${reportPortalUri}/launch/${launchId}/finish`, JSON.stringify(payload), getHeader(reporterOptions.token));
        if (response && response.status === 200) {
            const result = JSON.parse(response.body);
            return result;
        } else {
            return null;
        }
    } catch (e) {
        return null;
    }
} 