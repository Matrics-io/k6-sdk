/**
 * gRPC request/response logging for k6 performance testing SDK
 */

import { getEnvVar } from '../config/env.js';

const LOG_LEVELS = {
    NONE: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4, TRACE: 5
};

const TRUNCATE_LENGTH = 1000;

// Initialize log level
const logLevelName = getEnvVar('LOG_LEVEL', 'INFO').toUpperCase();
let currentLogLevel = LOG_LEVELS[logLevelName] ?? LOG_LEVELS.INFO;

function formatMessage(message) {
    if (!message) return null;
    
    const str = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
    return str.length > TRUNCATE_LENGTH ? str.substring(0, TRUNCATE_LENGTH) + '...' : str;
}

/**
 * Log gRPC request details
 */
export function logRequest(method, target, metadata, message) {
    if (currentLogLevel < LOG_LEVELS.DEBUG) return;
    
    console.log(`➡️ ${method} ${target}`);
    
    if (currentLogLevel >= LOG_LEVELS.TRACE) {
        if (metadata && Object.keys(metadata).length > 0) {
            console.log('Request Metadata:', JSON.stringify(metadata, null, 2));
        }
        
        if (message && Object.keys(message).length > 0) {
            const formatted = formatMessage(message);
            if (formatted) console.log('Request Message:', formatted);
        }
    }
}

/**
 * Log gRPC response details
 */
export function logResponse(response) {
    const { status = 0, error, method = 'unknown', timings } = response;
    const isError = status !== 0 || error;
    const duration = timings?.duration ? ` (${timings.duration.toFixed(2)}ms)` : '';
    const symbol = isError ? '❌' : '✅';
    
    if (isError) {
        console.error(`${symbol} gRPC status=${status} ${method}${duration}`);
        
        if (currentLogLevel >= LOG_LEVELS.ERROR) {
            if (error) console.error('gRPC Error:', error);
            
            const formatted = formatMessage(response.message);
            if (formatted) console.error('Response Message:', formatted);
        }
        return;
    }
    
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
        console.log(`${symbol} gRPC status=${status} ${method}${duration}`);
        
        if (currentLogLevel >= LOG_LEVELS.TRACE) {
            if (response.headers) {
                console.log('Response Headers:', JSON.stringify(response.headers, null, 2));
            }
            
            const formatted = formatMessage(response.message);
            if (formatted) console.log('Response Message:', formatted);
            
            if (response.trailers) {
                console.log('Response Trailers:', JSON.stringify(response.trailers, null, 2));
            }
            
            if (response.metadata) {
                console.log('Response Metadata:', JSON.stringify(response.metadata, null, 2));
            }
        }
    }
}

/**
 * Set the current log level
 */
export function setLogLevel(level) {
    if (typeof level === 'string') {
        const levelName = level.toUpperCase();
        if (LOG_LEVELS[levelName] !== undefined) {
            currentLogLevel = LOG_LEVELS[levelName];
        }
    } else if (typeof level === 'number') {
        currentLogLevel = level;
    }
}

/**
 * Get the current log level
 */
export function getCurrentLogLevel() {
    return currentLogLevel;
}

/**
 * Check if logging is enabled for a specific level
 */
export function shouldLog(level) {
    return currentLogLevel >= level;
}

export const logLevels = LOG_LEVELS;