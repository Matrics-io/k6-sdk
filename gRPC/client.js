import grpc from 'k6/net/grpc';
import { fail } from 'k6';
import { logRequest, logResponse } from './logger.js';
import { trackMetrics } from './metrics.js';

const DEFAULT_ADDRESS = 'localhost:50051';
const DEFAULT_TIMEOUT = '60s';

/**
 * Create a gRPC client
 */
export function createGrpcClient(options = {}) {
    const {
        address = DEFAULT_ADDRESS,
        protoPaths = [],
        protoFiles = [],
        protosetPath = null,
        reflect = false,
        plaintext = false,
        defaultMetadata = {},
        token = null,
        tags = {},
        connectParams = {}
    } = options;

    const client = new grpc.Client();
    let connected = false;
    let authToken = token;

    // Load protocol definitions
    if (!reflect) {
        if (protosetPath) {
            client.loadProtoset(protosetPath);
        } else if (protoFiles.length > 0) {
            client.load(protoPaths, ...protoFiles);
        } else {
            throw new Error('Proto files must be specified when not using reflection');
        }
    }

    function connect() {
        if (!connected) {
            client.connect(address, { plaintext, ...connectParams });
            connected = true;
        }
    }

    function close() {
        if (connected) {
            client.close();
            connected = false;
        }
    }

    function executeRequest(methodUrl, request, params, isStreaming = false) {
        connect();
        const metadata = { ...defaultMetadata, ...params.metadata };
        if (authToken && !metadata.authorization) {
            metadata.authorization = `Bearer ${authToken}`;
        }

        const requestTags = {
            ...tags,
            ...params.tags,
            method: methodUrl,
            address,
            fullMethod: methodUrl,
            service: methodUrl.split('.')[0] || 'unknown',
            target: address
        };

        if (isStreaming) requestTags.streaming = true;

        const invokeParams = {
            metadata,
            tags: requestTags,
            timeout: params.timeout ?? DEFAULT_TIMEOUT,
            ...(params.authority && { authority: params.authority }),
            ...(params.discardResponseMessage !== undefined && { 
                discardResponseMessage: params.discardResponseMessage 
            })
        };

        // Log and execute
        const logType = isStreaming ? 'GRPC_STREAM' : 'GRPC';
        logRequest(logType, `${address}/${methodUrl}`, metadata, request);

        let response;
        try {
            response = isStreaming 
                ? client.invokeStream(methodUrl, request, invokeParams)
                : client.invoke(methodUrl, request, invokeParams);
        } catch (error) {
            const errorMsg = `gRPC ${isStreaming ? 'stream ' : ''}invoke failed: ${error.message}`;
            fail(errorMsg);
            throw error;
        }

        logResponse(response);
        trackMetrics(response, requestTags);
        return response;
    }

    return {
        connect,
        close,
        invoke: (methodUrl, request = {}, params = {}) => 
            executeRequest(methodUrl, request, params, false),
        invokeStream: (methodUrl, request = {}, params = {}) => 
            executeRequest(methodUrl, request, params, true),
        healthcheck: (serviceName) => {
            connect();
            try {
                return client.healthCheck(serviceName);
            } catch (error) {
                fail(`gRPC health check failed: ${error.message}`);
                throw error;
            }
        },
        setToken: (newToken) => { authToken = newToken; },
        addDefaultMetadata: (metadata) => Object.assign(defaultMetadata, metadata),
        getConfig: () => ({
            address, reflect, plaintext, 
            defaultMetadata: { ...defaultMetadata }, 
            token: authToken, tags: { ...tags }
        })
    };
}

export default { create: createGrpcClient };