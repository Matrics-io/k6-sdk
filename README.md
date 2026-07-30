# k6 Performance Testing SDK

[![version](https://img.shields.io/badge/version-1.1.3-blue.svg)](https://github.com/your-org/k6-perf-sdk/releases)

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

Not published to a registry yet? Install straight from a checkout or a tarball —
both give you the same `k6w` binary described below:

```bash
# from a local checkout of platform-tests
npm install --save-dev /path/to/platform-tests/SDKs/k6

# or from a packed tarball (run `npm pack` inside SDKs/k6 to produce it)
npm install --save-dev ./k6-perf-sdk-1.1.2.tgz
```

## The `k6w` wrapper

The SDK ships `bin/k6w`, a drop-in replacement for the `k6` command that registers
each run with Insightest, streams container stats, and reports completion. Because
it is declared in the package's `bin` field, installing the SDK puts it on your
project's PATH at `node_modules/.bin/k6w` — no copying the script into your repo.

```bash
# run it directly
npx k6w run tests/load-test.js

# or wire it into package.json scripts, where node_modules/.bin is already on PATH
#   "scripts": { "perf": "k6w run tests/load-test.js" }
npm run perf
```

Anything that is not `run` (or the `rerun <run_id>` subcommand) is passed straight
through to the real k6 binary, so `k6w inspect …`, `k6w version`, etc. behave as usual.

`k6w` needs a k6 binary to delegate to — ideally the `xk6-clickhouse` build, or
metrics never reach the dashboard. It looks for one in this order: `K6W_K6_BIN`, a
`k6` next to the wrapper (including `node_modules/.bin/k6`), `k6` on PATH, then
`./k6`. On CI the explicit override is the most predictable:

```bash
export K6W_K6_BIN=/usr/local/bin/k6
export INSIGHTEST_API_URL=https://insightest.example.com   # only for a deployed Insightest
export INSIGHTEST_INGEST_API_KEY=tk_…     # the project's API key
npx k6w run tests/load-test.js
```

`INSIGHTEST_API_URL` defaults to `http://localhost:4000`, the local development
API, so it only needs setting when Insightest runs somewhere else.

### The project API key

`INSIGHTEST_INGEST_API_KEY` is a key issued by Insightest against one project. It
authenticates the wrapper *and* selects the project, so there is nothing else to
configure: a key issued for one project cannot register runs against another, read
another project's stored configuration, or touch another project's runs.

Get one from the project's **General** settings in Insightest — *Run performance
tests* → *Copy setup command* hands you the `export` line to run on the load host.
The same key is available from `POST /api/projects/{id}/api-keys` for scripted
setup. Either way it takes project editor or owner (a superadmin, or an owner/admin
of the project's organization, also qualifies), the raw value is shown exactly once,
and only its sha256 is stored.

That makes `INSIGHTEST_PROJECT` optional. If you do set it, it must name the key's
own project — a mismatch is rejected rather than silently redirected, which catches
a repo configured for one project holding another's key.

Revoke and rotate with `DELETE /api/projects/{id}/api-keys/{keyId}` — a project can
hold several keys at once, so issue the new one, deploy it, then revoke the old.
Issuing a key never invalidates an existing one, so a machine already set up keeps
working when someone else copies a fresh command.

#### Keeping the key off the command line

The `export` line from the UI lasts as long as the shell it was pasted into. For
something durable, `k6w` also reads the key from two optional files, so a clone is
ready to run and no secret is ever a candidate for `git add`:

```ini
# ~/.config/insightest/credentials — per machine, chmod 600, holds the keys
[default]
api_key = tk_…

[medical-apps]
api_key = tk_…
```

```ini
# .insightest — committed with the tests. Says which key, never what it is.
profile = medical-apps
api_url = https://insightest.example.com   # optional
```

The repo names the credential; the machine holds it. `.insightest` is found by
walking up from the current directory, so it works from any subdirectory, and the
profile falls back to `default` when no repo file exists — a single-project machine
configures nothing anywhere. Then:

```bash
npx k6w run tests/load-test.js -o xk6-clickhouse
```

Precedence is environment first, so CI is unaffected: it injects
`INSIGHTEST_INGEST_API_KEY` from its own secret store, has neither file, and none of
this runs. `INSIGHTEST_PROFILE` overrides the repo file for a one-off, and
`INSIGHTEST_CREDENTIALS` points at a different key file.

Both files are parsed, never sourced. A key written into the committed `.insightest`
is a hard error rather than a warning — that file is version-controlled, so a key in
it is already leaked and needs revoking, not ignoring.

Older deployments used a single shared `INSIGHTEST_INGEST_API_KEY` for every
project, set on the server. That still works and still honours `INSIGHTEST_PROJECT`,
but it cannot be scoped, revoked or attributed, and it is on its way out.

Other useful variables: `K6W_CONTAINER` (comma-separated container names to sample
Docker stats for), `K6W_DOCKER_SOCKET`, `K6W_STATS_INTERVAL`.

### Configuration stored in Insightest

Everything a run needs beyond the project's API key can live in Insightest instead
of on the command line. Before `k6w` starts k6 it calls `GET /api/k6/config` and
exports what it gets back, so a full invocation against the local API is:

```bash
INSIGHTEST_INGEST_API_KEY=tk_… npx k6w run tests/load-test.js -o xk6-clickhouse
```

The ClickHouse coordinates (`K6_CLICKHOUSE_ADDR`, `USER`, `PASSWORD`, `DB`,
`PUSH_INTERVAL`) come from the server automatically — it already knows where its own
metrics store is. Everything else is stored per project and managed through
`/api/projects/{id}/env-vars`: target hosts (`HTTP_HOST`), the API tokens your
script needs, and so on. Values can be marked secret, in which case they are
encrypted at rest and masked everywhere except this response.

Keep per-run choices out of it. `K6W_CONTAINER` is the clearest example: which
container to sample depends on what you are testing right now, so it belongs on the
command line even though the mechanism would happily store it.

**A local value always wins.** `k6w` only fills in variables that are unset in your
shell, so pointing a run at a local stack still works:

```bash
HTTP_HOST=http://localhost:9200 npx k6w run tests/load-test.js
```

**Environment profiles.** A project can store more than one set of values.
`K6W_ENV` picks one, overlaid on the `default` profile, so shared values are stored
once and only the differences are repeated:

```bash
K6W_ENV=staging npx k6w run tests/load-test.js
```

The fetch happens before `k6 inspect`, so a script that reads a variable at init
time sees it. It is best-effort: if Insightest is unreachable or rejects the
request, `k6w` says so and continues with whatever the shell provides — anything
genuinely missing is then reported by k6 or the script itself. `K6W_SKIP_CONFIG_FETCH=1`
disables it entirely.

Two things are never taken from the server: names that decide what code the host
runs (`PATH`, `LD_PRELOAD`, …) and host-local settings (`K6W_K6_BIN`,
`K6W_DOCKER_SOCKET`), including the bootstrap variables above. The API refuses to
store them and `k6w` refuses to apply them.

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
