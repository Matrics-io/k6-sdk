/**
 * Integration tests for the k6 HTTP client wrapper (createHttpClient).
 * Uses Jest and k6 mocks so the client runs in Node against real or mock HTTP.
 */

import http from 'node:http';
import { check } from 'k6';
import { createHttpClient } from './client.js';

// Avoid loading real metrics.js (it has a duplicate import); we only need the client under test
jest.mock('./metrics.js', () => ({ trackMetrics: () => {} }));

/** @type {http.Server} */
let server;
/** @type {string} Base URL for the mock server (e.g. http://127.0.0.1:PORT) */
let baseUrl;
/** Last request captured for assertions: { method, url, headers, body } */
let lastRequest;

function createMockServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;
    const bodyChunks = [];

    req.on('data', (chunk) => bodyChunks.push(chunk));
    req.on('end', () => {
      const body = bodyChunks.length ? Buffer.concat(bodyChunks).toString('utf8') : null;
      lastRequest = {
        method: req.method,
        url: req.url,
        pathname,
        headers: { ...req.headers },
        body
      };

      // Route by path
      if (pathname === '/ok' || pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (pathname === '/not-found') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        return;
      }
      if (pathname === '/server-error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
        return;
      }
      if (pathname === '/echo' && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body || '{}');
        return;
      }
      if (pathname.startsWith('/resource/') && req.method === 'DELETE') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ deleted: true }));
        return;
      }
      if (pathname === '/put' && req.method === 'PUT') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });
  });
}

describe('HTTP client (integration)', () => {
  beforeAll((done) => {
    server = createMockServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterAll((done) => {
    if (server) server.close(done);
  });

  beforeEach(() => {
    lastRequest = null;
  });

  describe('mock server', () => {
    it('responds to GET /ok with 200 and captures request', async () => {
      const res = await fetch(`${baseUrl}/ok`);
      expect(res.status).toBe(200);
      expect(lastRequest).not.toBeNull();
      expect(lastRequest.method).toBe('GET');
      expect(lastRequest.pathname).toBe('/ok');
    });

    it('responds to POST /echo with 200 and echoes body', async () => {
      const body = JSON.stringify({ foo: 'bar' });
      const res = await fetch(`${baseUrl}/echo`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(body);
      expect(lastRequest.method).toBe('POST');
      expect(lastRequest.pathname).toBe('/echo');
      expect(lastRequest.body).toBe(body);
    });

    it('responds with 404 for /not-found and 500 for /server-error', async () => {
      const notFound = await fetch(`${baseUrl}/not-found`);
      expect(notFound.status).toBe(404);
      const serverError = await fetch(`${baseUrl}/server-error`);
      expect(serverError.status).toBe(500);
    });
  });

  describe('createHttpClient and getConfig', () => {
    it('creates a client with baseUrl and getConfig returns it', () => {
      const baseUrl = 'http://localhost:9999';
      const client = createHttpClient({ baseUrl });
      const config = client.getConfig();
      expect(config).toBeDefined();
      expect(config.baseUrl).toBe(baseUrl);
    });

    it('returns default config when created with empty options', () => {
      const client = createHttpClient();
      const config = client.getConfig();
      expect(config.baseUrl).toBe('');
      expect(config.defaultHeaders).toEqual({});
      expect(config.token).toBeNull();
      expect(config.tags).toEqual({});
    });

    it('returns defaultHeaders, token, and tags when provided', () => {
      const client = createHttpClient({
        baseUrl: 'https://api.example.com',
        defaultHeaders: { 'Accept': 'application/json' },
        token: 'secret',
        tags: { service: 'test' }
      });
      const config = client.getConfig();
      expect(config.baseUrl).toBe('https://api.example.com');
      expect(config.defaultHeaders).toEqual({ Accept: 'application/json' });
      expect(config.token).toBe('secret');
      expect(config.tags).toEqual({ service: 'test' });
    });
  });

  describe('GET, POST, PUT, DELETE methods', () => {
    it('GET returns 200 and server receives GET /ok', async () => {
      const client = createHttpClient({ baseUrl });
      const response = await client.get('/ok');
      expect(response.status).toBe(200);
      expect(lastRequest).not.toBeNull();
      expect(lastRequest.method).toBe('GET');
      expect(lastRequest.pathname).toBe('/ok');
    });

    it('POST sends body and receives response', async () => {
      const client = createHttpClient({ baseUrl });
      const body = { foo: 'bar' };
      const response = await client.post('/echo', body);
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual(body);
      expect(lastRequest.method).toBe('POST');
      expect(lastRequest.pathname).toBe('/echo');
      expect(JSON.parse(lastRequest.body)).toEqual(body);
    });

    it('PUT sends body and receives 200', async () => {
      const client = createHttpClient({ baseUrl });
      const body = { id: 1 };
      const response = await client.put('/put', body);
      expect(response.status).toBe(200);
      expect(lastRequest.method).toBe('PUT');
      expect(lastRequest.pathname).toBe('/put');
      expect(JSON.parse(lastRequest.body)).toEqual(body);
    });

    it('DELETE returns 200 and server receives DELETE', async () => {
      const client = createHttpClient({ baseUrl });
      const response = await client.delete('/resource/1');
      expect(response.status).toBe(200);
      expect(lastRequest.method).toBe('DELETE');
      expect(lastRequest.pathname).toBe('/resource/1');
    });
  });

  describe('error handling and retries', () => {
    it('returns 404 response without throwing (client does not throw on 4xx)', async () => {
      const client = createHttpClient({ baseUrl });
      const response = await client.get('/not-found');
      expect(response.status).toBe(404);
      expect(response.body).toBeDefined();
    });

    it('returns 500 response without throwing (client does not throw on 5xx)', async () => {
      const client = createHttpClient({ baseUrl });
      const response = await client.get('/server-error');
      expect(response.status).toBe(500);
    });

    it('throws and calls fail on connection refused', async () => {
      const client = createHttpClient({ baseUrl: 'http://127.0.0.1:9/' });
      await expect(client.get('/')).rejects.toThrow();
    });

    it('makes only one request on failure (no retries)', async () => {
      const client = createHttpClient({ baseUrl });
      let requestCount = 0;
      const origFetch = global.fetch;
      global.fetch = (...args) => {
        requestCount++;
        return origFetch.apply(this, args);
      };
      try {
        await client.get('/not-found');
      } finally {
        global.fetch = origFetch;
      }
      expect(requestCount).toBe(1);
    });
  });

  describe('header management', () => {
    it('sends default headers with every request', async () => {
      const client = createHttpClient({
        baseUrl,
        defaultHeaders: { 'X-Custom': 'default', 'Content-Type': 'application/json' }
      });
      await client.get('/ok');
      expect(lastRequest.headers['x-custom']).toBe('default');
      expect(lastRequest.headers['content-type']).toBe('application/json');
    });

    it('injects Authorization Bearer when token is set', async () => {
      const client = createHttpClient({ baseUrl, token: 'secret' });
      await client.get('/ok');
      expect(lastRequest.headers['authorization']).toBe('Bearer secret');
    });

    it('overrides default headers with params.headers', async () => {
      const client = createHttpClient({
        baseUrl,
        defaultHeaders: { 'X-Custom': 'default' }
      });
      await client.get('/ok', { headers: { 'X-Custom': 'overridden' } });
      expect(lastRequest.headers['x-custom']).toBe('overridden');
    });

    it('does not override existing Authorization when token is set', async () => {
      const client = createHttpClient({
        baseUrl,
        token: 'ignored',
        defaultHeaders: { 'Authorization': 'Custom xyz' }
      });
      await client.get('/ok');
      expect(lastRequest.headers['authorization']).toBe('Custom xyz');
    });
  });

  describe('response validation', () => {
    it('returns k6-shaped response with status, body, headers, url, timings', async () => {
      const client = createHttpClient({ baseUrl });
      const response = await client.get('/ok');
      expect(response).toHaveProperty('status', 200);
      expect(response).toHaveProperty('body');
      expect(typeof response.body).toBe('string');
      expect(response).toHaveProperty('headers');
      expect(response).toHaveProperty('url');
      expect(response).toHaveProperty('timings');
      expect(response.timings).toHaveProperty('duration');
      expect(typeof response.timings.duration).toBe('number');
    });

    it('response is suitable for k6 check() validation', async () => {
      const client = createHttpClient({ baseUrl });
      const response = await client.get('/ok');
      const result = check(response, { 'status is 200': (r) => r.status === 200 });
      expect(result).toBe(true);
    });

    it('check() fails for 404 response', async () => {
      const client = createHttpClient({ baseUrl });
      const response = await client.get('/not-found');
      const result = check(response, { 'status is 200': (r) => r.status === 200 });
      expect(result).toBe(false);
    });
  });
});
