# k6 Performance Testing SDK

[![version](https://img.shields.io/badge/version-1.1.5-blue.svg)](https://github.com/your-org/k6-perf-sdk/releases)

A modular and reusable SDK for creating performance tests with k6. This SDK provides common test templates, configuration management, authentication helpers, HTTP and gRPC client utilities to streamline performance testing across multiple projects.

## Features

- 📊 **Test Templates** - Pre-built templates for smoke, load, stress, and soak testing
- ⚙️ **Dynamic Configuration** - JSON config, runtime variables, and a per-repo `.insightest.env`
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
npm install --save-dev ./k6-perf-sdk-1.1.5.tgz
```

Installing sets the repo up: it creates `.insightest.env`, adds it to `.gitignore`, and
builds the k6 binary the SDK is pinned to. One command does the same thing by hand, and
is the way in for any repo where install scripts don't run (see
[When install scripts don't run](#when-install-scripts-dont-run)):

```bash
npx k6w init
```

After that, paste a project API key into `.insightest.env` and you can run tests.

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

Anything that is not `run` (or the `init` / `install-k6` / `rerun <run_id>` subcommands)
is passed straight through to the real k6 binary, so `k6w inspect …`, `k6w version`,
etc. behave as usual.

### The k6 binary

`k6w` delegates to a real k6 binary, and it has to be an `xk6-clickhouse` build — a
stock k6 runs the test fine but streams no metrics, so the run never appears in the
dashboard. `k6w install-k6` builds the right one:

```bash
npx k6w install-k6           # builds into tools/k6/k6 and gitignores it
npx k6w install-k6 --force   # rebuild an existing one
```

It needs **Docker or Go**, not both, and nothing else:

- **Docker** (preferred) uses `grafana/xk6`, so the host needs no Go toolchain at all.
  That matters because the repos consuming this SDK are Node, Go and Python, and only
  one of those can be assumed to have Go.
- **A native `xk6`** on PATH is used when Docker isn't available.

Either way the build is cross-compiled for the host's own `GOOS`/`GOARCH`. This is the
one thing a hand-written `docker run grafana/xk6 build …` gets wrong away from Linux:
the build happens inside a Linux container, so it produces a Linux binary that a macOS
host cannot execute.

The k6 version and the extension version are pinned together at the top of `bin/k6w`.
They are coupled — the extension decides the shape of what lands in ClickHouse and
Insightest reads that shape back — so a binary built from a different pairing can
stream metrics that never show up, with nothing visibly wrong at either end. Changing
either version means cutting an SDK release.

Resolution order, first match wins: `K6W_K6_BIN`, a `k6` next to the wrapper
(including `node_modules/.bin/k6`), `k6` on PATH, `tools/k6/k6` under the repo root,
then `./k6`. A relative `K6W_K6_BIN` resolves against the directory holding
`.insightest.env`, not the current directory, so runs from a subdirectory work.

On CI, skip the build and export the path to a binary you already have:

```bash
export K6W_K6_BIN=/usr/local/bin/k6
export INSIGHTEST_API_URL=https://insightest.example.com   # only for a deployed Insightest
export INSIGHTEST_INGEST_API_KEY=tk_…     # the project's API key, from CI secrets
npx k6w run tests/load-test.js
```

`INSIGHTEST_API_URL` defaults to `http://localhost:4000`, the local development
API, so it only needs setting when Insightest runs somewhere else.

### When install scripts don't run

pnpm 10 and later refuse to run dependency install scripts unless the package is
allowlisted, so in a pnpm repo the automatic setup does nothing and you get:

```
Ignored build scripts: k6-perf-sdk.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

Two ways forward. Either allowlist it — in `pnpm-workspace.yaml` (or `package.json`
under a `pnpm` key):

```yaml
onlyBuiltDependencies:
  - 'k6-perf-sdk'
```

…or skip install scripts entirely and run the equivalent by hand, which does exactly
the same work:

```bash
npx k6w init
```

The same applies anywhere `--ignore-scripts` is in effect, which is common in
locked-down CI. Nothing about the SDK depends on the postinstall having run: `init` and
`postinstall` do the same job, and `k6w run` tells you what's missing if neither did.

### Configuring a repo

Everything that is constant for the repo — which Insightest, which key, which k6
binary — lives in one file, `.insightest.env`, at the root of the test repo. Installing
the SDK creates it from a template and adds it to `.gitignore`; `npx k6w init` does the
same by hand.

```sh
# .insightest.env — not committed, holds the project API key
INSIGHTEST_API_URL=http://localhost:4000
INSIGHTEST_PROJECT=91life_medical-apps
INSIGHTEST_INGEST_API_KEY=tk_…
K6W_K6_BIN=tools/k6/k6
```

With that in place a run carries only the choices that change from run to run:

```bash
K6W_CONTAINER=opensearch npx k6w run tests/load-test.js -o xk6-clickhouse
```

The file is found by walking up from the current directory, the way git finds its own
config, so runs work from any subdirectory. `K6W_ENV_FILE` points at a different file.

**Precedence is environment first.** A variable already set in your shell is never
overwritten, so CI injects `INSIGHTEST_INGEST_API_KEY` from its own secret store, has
no file, and none of this applies — and a one-off override still works:

```bash
INSIGHTEST_API_URL=http://localhost:9999 npx k6w run tests/load-test.js
```

An empty value in the file counts as unset, which is why the shipped template can ship
`INSIGHTEST_INGEST_API_KEY=` blank.

The file is parsed, never sourced — `KEY=VALUE` lines only, no command substitution,
no shell. A file that executes shell on every load test is exactly the risk the
protected-name list further down exists to prevent.

Because it holds the key, it must not be committed. `k6w` checks: if the file carries
a key and `git` does not ignore it, every run prints a loud warning naming the line to
add to `.gitignore`. It warns rather than refuses — the key is not leaked yet, and the
fix is one line.

### The project API key

`INSIGHTEST_INGEST_API_KEY` is a key issued by Insightest against one project. It
authenticates the wrapper *and* selects the project, so there is nothing else to
configure: a key issued for one project cannot register runs against another, read
another project's stored configuration, or touch another project's runs.

A project has **one key, shared by everyone who works on it.** Get it from the
project's **General** settings in Insightest — *Run performance tests* → *Copy token* —
and paste it into the `INSIGHTEST_INGEST_API_KEY` line of your `.insightest.env`.
Everyone with access sees the same value, so there is no reason to generate your own;
`GET /api/projects/{id}/api-keys/token` is the same thing for scripted setup.

Reading it takes project editor or owner (a superadmin, or an owner/admin of the
project's organization, also qualifies). Viewers cannot: a key grants read of the
project's stored configuration, including values marked secret.

The key is stored hashed *and* encrypted — hashed is what authentication checks,
encrypted is what makes it displayable again. Keys issued before that was true still
work but cannot be shown; the UI offers to replace one instead, and
`GET .../api-keys/token` answers `409 token_not_retrievable` for it.

**Rotating.** *Rotate* in the UI (or `POST /api/projects/{id}/api-keys`) issues a new
key and does **not** revoke the old one, so nothing configured with the previous value
breaks the moment somebody rotates. Revoke the old one explicitly with
`DELETE /api/projects/{id}/api-keys/{keyId}` once everything is moved over.

### The project key

`INSIGHTEST_PROJECT` names the project a repo's tests belong to. Use the project's
**project key** — a stable identifier like `91life_medical-apps`, shown next to the
token in the UI. It is not a secret and does not authorize anything; the API key
remains the credential.

It is optional, because the API key already identifies the project. Two reasons to set
it anyway:

- **It catches the wrong key.** With both present, a repo holding another project's key
  is rejected with a 403 instead of silently recording its runs against that other
  project.
- **It survives renames.** A project key is assigned when the project is created and is
  never rewritten. Display names are only unique within an organization and change
  whenever somebody renames a project, so configuration referring to a name used to
  stop resolving without saying so.

Names still resolve, for repos configured before project keys existed: `name`, or
`organization/name` to disambiguate a name used in more than one organization.

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

Keep per-run choices out of it — out of `.insightest.env` too. `K6W_CONTAINER` is the
clearest example: which container to sample depends on what you are testing right now,
so it belongs on the command line even though both mechanisms would happily store it.
A value you change every run is a value you should not have to open a file to change.

**A local value always wins.** `k6w` only fills in variables that are unset — by your
shell or by `.insightest.env` — so pointing a run at a local stack still works:

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

The SDK's config helpers read k6's `__ENV`, which k6 populates from the host
environment. So a variable your script needs can come from `.insightest.env` when you
run through `k6w`:

```sh
# .insightest.env
BASE_URL=https://api.example.com
AUTH_TYPE=bearer
AUTH_TOKEN=your-token-here
```

from the shell, or from k6's own flag:

```bash
k6 run script.js -e BASE_URL=https://api.example.com -e AUTH_TOKEN=your-token-here
```

Note that the SDK modules themselves do not parse any file — `config/env.js` reads
`__ENV` (or `process.env` outside k6) and nothing else. `.insightest.env` is loaded by
the `k6w` wrapper, which exports its contents before starting k6.

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
