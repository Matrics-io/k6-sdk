import { Trend, Rate, Counter } from 'k6/metrics';

// Constants
const GRPC_STATUS_CODES = {
    OK: 0, CANCELLED: 1, UNKNOWN: 2, INVALID_ARGUMENT: 3, DEADLINE_EXCEEDED: 4, 
    NOT_FOUND: 5, ALREADY_EXISTS: 6, PERMISSION_DENIED: 7, RESOURCE_EXHAUSTED: 8, 
    FAILED_PRECONDITION: 9, ABORTED: 10, OUT_OF_RANGE: 11, UNIMPLEMENTED: 12, 
    INTERNAL: 13, UNAVAILABLE: 14, DATA_LOSS: 15, UNAUTHENTICATED: 16
};

const DEFAULT_SERVICE_METHOD = 'unknown';

// Core gRPC metrics
const coreMetrics = {
    grpcReqDuration: new Trend('grpc_req_duration', true),
    grpcReqFailed: new Rate('grpc_req_failed', true),
    grpcReqBlocked: new Trend('grpc_req_blocked', true),
    grpcReqConnecting: new Trend('grpc_req_connecting', true),
    grpcReqTLSHandshaking: new Trend('grpc_req_tls_handshaking', true),
    grpcReqSending: new Trend('grpc_req_sending', true),
    grpcReqWaiting: new Trend('grpc_req_waiting', true),
    grpcReqReceiving: new Trend('grpc_req_receiving', true),
};

// gRPC status code counters
const statusMetrics = {};
Object.values(GRPC_STATUS_CODES).forEach(statusCode => {
    statusMetrics[`grpcStatus${statusCode}`] = new Counter(`grpc_status_${statusCode}`);
});

// Endpoint metrics (populated dynamically)
const endpointMetrics = {};

/**
 * Track metrics for a gRPC response
 * @param {Object} response - k6 gRPC response
 * @param {Object} tags - Tags to apply to metrics
 */
export function trackMetrics(response, tags = {}) {
    const { status = 0, timings = {} } = response;
    const duration = timings.duration || 0;
    const isSuccess = status === GRPC_STATUS_CODES.OK;
    
    const enrichedTags = {
        service: tags.service || DEFAULT_SERVICE_METHOD,
        method: tags.method || DEFAULT_SERVICE_METHOD,
        fullMethod: tags.fullMethod || tags.method || DEFAULT_SERVICE_METHOD,
        target: tags.target || DEFAULT_SERVICE_METHOD,
        ...tags
    };
    
    coreMetrics.grpcReqDuration.add(duration, enrichedTags);
    coreMetrics.grpcReqFailed.add(!isSuccess, enrichedTags);
    
    const timingMap = [
        ['blocked', coreMetrics.grpcReqBlocked],
        ['connecting', coreMetrics.grpcReqConnecting],
        ['tls_handshaking', coreMetrics.grpcReqTLSHandshaking],
        ['sending', coreMetrics.grpcReqSending],
        ['waiting', coreMetrics.grpcReqWaiting],
        ['receiving', coreMetrics.grpcReqReceiving]
    ];
    
    timingMap.forEach(([timing, metric]) => {
        if (timings[timing] !== undefined) {
            metric.add(timings[timing], enrichedTags);
        }
    });
    
    // Track status code
    const statusMetric = statusMetrics[`grpcStatus${status}`];
    if (statusMetric) {
        statusMetric.add(1, enrichedTags);
    }
    
    // Track endpoint metrics
    const serviceMethod = extractServiceMethod(tags.fullMethod || tags.method);
    if (serviceMethod) {
        const cleanMethodName = serviceMethod.replace(/[^a-zA-Z0-9_]/g, '_');
        
        if (!endpointMetrics[cleanMethodName]) {
            endpointMetrics[cleanMethodName] = {
                duration: new Trend(`endpoint_${cleanMethodName}_duration`, true),
                successRate: new Rate(`endpoint_${cleanMethodName}_success_rate`, true),
                errorRate: new Rate(`endpoint_${cleanMethodName}_error_rate`, true)
            };
        }
        
        endpointMetrics[cleanMethodName].duration.add(duration, enrichedTags);
        endpointMetrics[cleanMethodName].successRate.add(isSuccess, enrichedTags);
        endpointMetrics[cleanMethodName].errorRate.add(!isSuccess, enrichedTags);
    }
}

/**
 * Extract service method name from gRPC method
 */
function extractServiceMethod(method) {
    if (!method) return DEFAULT_SERVICE_METHOD;
    
    try {
        const parts = method.split(/[./]/);
        return parts.length >= 2 ? `${parts[parts.length - 2]}_${parts[parts.length - 1]}` 
                                 : method.replace(/[^a-zA-Z0-9_]/g, '_');
    } catch (e) {
        return method.replace(/[^a-zA-Z0-9_]/g, '_');
    }
}

/**
 * Create a custom gRPC metric
 */
export function createMetric(name, type = 'trend') {
    const types = {
        trend: () => new Trend(name, true),
        counter: () => new Counter(name),
        rate: () => new Rate(name, true)
    };
    
    const factory = types[type.toLowerCase()];
    if (!factory) throw new Error(`Unsupported metric type: ${type}`);
    
    return factory();
}

// Exports
export const metrics = { ...coreMetrics, ...statusMetrics, endpoints: endpointMetrics };
export { GRPC_STATUS_CODES as statusCodes };
