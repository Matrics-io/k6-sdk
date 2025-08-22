# k6 Performance Testing SDK

A modular and reusable SDK for creating performance tests with k6. This SDK provides common test templates, configuration management, authentication helpers, HTTP and gRPC client utilities to streamline performance testing across multiple projects.

## Features

- 📊 **Test Templates** - Pre-built templates for smoke, load, stress, and soak testing
- ⚙️ **Dynamic Configuration** - Support for .env files, JSON config, and runtime variables
- 🔐 **Authentication Helpers** - Common auth flows and token management
- 🌐 **HTTP Client Wrapper** - Built-in logging, metrics, and error handling
- 🔌 **gRPC Client Wrapper** - Full gRPC support with same ergonomics as HTTP
- 🧩 **Fully Modular** - Use just what you need or the entire SDK
- 🔄 **Project Agnostic** - Works with any API or web application

## Installation

```bash
# If using npm
npm install k6-perf-sdk --save-dev

# If using yarn
yarn add k6-perf-sdk --dev
```

## Quick Start

```javascript
import { createTestSdk } from 'k6-perf-sdk';

// Create a configured SDK instance
const sdk = createTestSdk({
  configPath: './perf-config.json'
});

// Run a load test using the configured SDK
export default sdk.templates.load({
  endpoints: ['login', 'getUsers', 'logout'],
  vus: 10,
  duration: '1m'
});
```

## Configuration

The SDK supports multiple configuration methods:

### JSON Configuration File

```json
{
  "baseUrl": "https://api.example.com",
  "headers": {
    "Content-Type": "application/json",
    "Accept": "application/json"
  },
  "auth": {
    "type": "oauth",
    "tokenUrl": "https://api.example.com/oauth/token",
    "clientId": "client-id",
    "clientSecret": "client-secret"
  },
  "endpoints": {
    "login": "/auth/login",
    "getUsers": "/users",
    "createUser": "/users",
    "getProducts": "/products"
  },
  "thresholds": {
    "http_req_duration": ["p(95)<500"]
  }
}
```

### Environment Variables

You can use environment variables with `.env` files or k6's `__ENV` variables:

```
# .env file
BASE_URL=https://api.example.com
AUTH_TYPE=bearer
AUTH_TOKEN=your-token-here
```

Or pass them when running k6:

```bash
k6 run script.js -e BASE_URL=https://api.example.com -e AUTH_TOKEN=your-token-here
```

## Test Templates

The SDK provides four main test templates:

### Smoke Test

Quick test with minimal load to verify system functionality.

```javascript
export default sdk.templates.smoke({
  endpoints: ['health', 'login'],
  iterations: 1
});
```

### Load Test

Test system performance under expected load conditions.

```javascript
export default sdk.templates.load({
  endpoints: ['login', 'getUsers', 'createOrder'],
  vus: 10,
  duration: '5m'
});
```

### Stress Test

Test system performance under heavy load to identify breaking points.

```javascript
export default sdk.templates.stress({
  endpoints: ['login', 'getUsers', 'createOrder'],
  stages: [
    { duration: '2m', target: 10 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 }
  ]
});
```

### Soak Test

Long-running test to verify system stability over time.

```javascript
export default sdk.templates.soak({
  endpoints: ['login', 'getUsers', 'createOrder'],
  vus: 5,
  duration: '30m'
});
```

## Authentication

The SDK supports various authentication methods:

### Bearer Token

```javascript
const sdk = createTestSdk({
  defaultConfig: {
    auth: {
      type: 'bearer',
      token: 'your-token'
    }
  }
});
```

### OAuth 2.0

```javascript
const sdk = createTestSdk({
  defaultConfig: {
    auth: {
      type: 'oauth',
      tokenUrl: 'https://auth.example.com/token',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      scope: 'read write'
    }
  }
});
```

### Custom Login Flow

```javascript
const sdk = createTestSdk();

// Use the auth module directly
sdk.auth.login({
  url: '/auth/login',
  credentials: {
    username: 'user',
    password: 'pass'
  },
  tokenPath: 'data.accessToken'
});
```

## HTTP Client

The HTTP client provides a wrapper around k6's http module with additional features:

```javascript
const sdk = createTestSdk();

// Make a request with automatic logging and metrics
const response = sdk.http.get('/users', {
  headers: { 'X-Custom-Header': 'value' },
  tags: { name: 'GetUsers' }
});

// Check response
sdk.utils.helpers.validateResponse(response, {
  checkStatus: true,
  expectedStatus: 200,
  checkJson: true,
  requiredFields: ['data', 'data.users']
});
```

## gRPC Client

The gRPC client provides a wrapper around k6's grpc module with the same ergonomics as HTTP:

```javascript
import { createGrpcClient } from 'k6-perf-sdk';

// Create gRPC client with proto files
const grpcClient = createGrpcClient({
  address: 'localhost:50051',
  protoFiles: ['user.proto'],
  protoPaths: ['./protos'],
  plaintext: true, // or false for TLS
  defaultMetadata: {
    'custom-header': 'value'
  }
});

// Make a unary call with automatic logging and metrics
const response = grpcClient.invoke('user.UserService/GetUser', {
  id: 123
}, {
  tags: { name: 'GetUser' },
  timeout: '30s'
});

// Make a server streaming call
const stream = grpcClient.invokeStream('user.UserService/StreamUsers', {
  filter: 'active'
}, {
  tags: { name: 'StreamUsers' }
});

// Health check
const health = grpcClient.healthcheck('user.UserService');

// Close connection when done
grpcClient.close();
```

## Advanced Usage

You can import and use individual modules:

```javascript
import { httpClient, config, auth } from 'k6-perf-sdk';

// Load configuration
const cfg = config.load('./config.json');

// Create HTTP client
const http = httpClient.create({
  baseUrl: cfg.baseUrl,
  defaultHeaders: cfg.headers
});

// Setup authentication
const authManager = auth.create(cfg.auth, http);

// Use in your custom test
export default function() {
  // Login
  authManager.login();
  
  // Make authenticated requests
  http.get('/users');
}
```

## Utility Functions

The SDK provides various helper functions:

```javascript
import { helpers, validation } from 'k6-perf-sdk';

// Generate random string
const randomId = helpers.randomString(10);

// Sleep with promise
await helpers.sleep(1000);

// Validate configurations
validation.validateTestConfig(myConfig);
```

## Module Reference

### Templates

The SDK includes the following test templates:

| Template | Description | Default Options |
|----------|-------------|-----------------|
| `smoke.js` | Quick verification test | 1 VU, 30s duration |
| `load.js` | Normal load test | 10 VUs, 5m duration |
| `stress.js` | Increasing load test | Staged load up to 100 VUs |
| `soak.js` | Long-running stability test | 5 VUs, 30m duration |

### Utils

The SDK includes the following utility modules:

| Module | Description | Key Functions |
|--------|-------------|---------------|
| `http.js` | HTTP client wrapper | `request()`, `get()`, `post()`, etc. |
| `grpc/` | gRPC client wrapper | `invoke()`, `invokeStream()`, `healthcheck()` |
| `auth.js` | Authentication helpers | `BearerTokenManager`, `OAuthManager` |
| `helpers.js` | General utilities | `randomString()`, `uuid()`, `sleep()` |
| `validation.js` | Input validation | `validateConfig()`, `validateResponse()` |

## Threshold Configuration

Thresholds define pass/fail criteria for your tests. The SDK uses the following format:

```javascript
thresholds: {
  http_req_duration: ['p(95)<500'], // 95% of requests must complete within 500ms
  http_req_failed: ['rate<0.01'],   // Less than 1% of requests can fail
  grpc_req_duration: ['p(95)<500'], // gRPC requests must complete within 500ms
  grpc_req_failed: ['rate<0.01']    // Less than 1% of gRPC requests can fail
}
```

## Best Practices

1. **Use Templates**: Start with pre-built templates and customize as needed
2. **Separate Configuration**: Keep test configuration separate from test logic
3. **Reuse Endpoints**: Define endpoints once and reuse across tests
4. **Monitor Resources**: Watch for memory usage in long-running tests
5. **Validate Responses**: Always validate response status and content

## Troubleshooting

### Common Issues

- **Threshold Errors**: Ensure threshold expressions use the correct format (`p(95)<500` not `p95<500`)
- **Authentication Failures**: Verify token format and expiration
- **Memory Issues**: For long tests, use the `--compatibility-mode=base` flag

### Debugging

Enable debug logging by setting the `DEBUG` environment variable:

```bash
# For general debugging
k6 run script.js -e DEBUG=true

# For detailed gRPC/HTTP logging
k6 run script.js -e LOG_LEVEL=DEBUG

# For maximum verbosity
k6 run script.js -e LOG_LEVEL=TRACE
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
