import http from 'k6/http';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';
import { getHeader } from './utils.js';

/**
 * ReportPortal Client Class
 * Handles all interactions with ReportPortal API
 */
export class RpClient {
    constructor(launchId, reporterOptions) {
        this.launchId = launchId;
        this.reportPortalUri = `${reporterOptions.endpoint}/api/v1/${reporterOptions.project}`;
        this.token = reporterOptions.token;
        this.reporterOptions = reporterOptions;
    }

    /**
     * Write a single log to ReportPortal
     */
    writeLog(id, message, level = 'error') {
        if (!this.reporterOptions.publishResult || !id) return null;
        
        const payload = {
            itemUuid: id,
            message: message,
            time: Date.now(),
            launchUuid: this.launchId,
            level: level
        };
        
        try {
            const response = http.post(`${this.reportPortalUri}/log`, JSON.stringify(payload), getHeader(this.token));
            return response.status === 201 ? JSON.parse(response.body).id : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Start a test item (suite, test, or step)
     */
    startItem(parentId, name, type, description) {
        if (!this.reporterOptions.publishResult) return null;
        
        const payload = {
            name: name,
            startTime: Date.now(),
            type: type,
            launchUuid: this.launchId,
            description: description
        };
        
        try {
            const url = parentId ? `${this.reportPortalUri}/item/${parentId}` : `${this.reportPortalUri}/item`;
            const response = http.post(url, JSON.stringify(payload), getHeader(this.token));
            return response.status === 201 ? JSON.parse(response.body).id : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Finish a test item
     */
    finishItem(id, status, issueType = null, comment = '') {
        if (!this.reporterOptions.publishResult || !id) return null;
        
        const payload = {
            endTime: Date.now(),
            status: status,
            launchUuid: this.launchId
        };
        
        if (issueType) {
            payload.issue = { issueType, comment };
        }
        
        try {
            const response = http.put(`${this.reportPortalUri}/item/${id}`, JSON.stringify(payload), getHeader(this.token));
            return response.status === 200 ? JSON.parse(response.body) : null;
        } catch (e) {
            return null;
        }
    }

    // Convenience methods
    startSuite(name, description) {
        return this.startItem(null, name, 'suite', description);
    }

    startTest(parentId, name, description) {
        return this.startItem(parentId, name, 'test', description);
    }

    startStep(parentId, name, description) {
        return this.startItem(parentId, name, 'step', description);
    }

    finishSuite(id, status) {
        const issueType = status === 'PASSED' ? null : 'PB001';
        const comment = status === 'PASSED' ? 'Suite completed successfully' : 'Suite failed';
        return this.finishItem(id, status, issueType, comment);
    }

    finishTest(id, status) {
        return this.finishItem(id, status);
    }

    finishStep(id, status, issueType = null, comment = '') {
        return this.finishItem(id, status, issueType, comment);
    }
} 