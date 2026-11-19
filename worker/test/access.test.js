import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const TOKEN = 'test-token-with-at-least-32-characters-long';

function environment(overrides = {}) {
  return {
    APIMON_API_TOKEN: TOKEN,
    APIMON_ALLOWED_ORIGIN: 'https://dashboard.example.com',
    APIMON_DB: { prepare: () => ({ all: async () => ({ results: [] }) }) },
    ...overrides
  };
}

test('allows a request with the configured bearer API token', async () => {
  const request = new Request('https://worker.example/api/monitors', {
    headers: { Authorization: 'Bearer ' + TOKEN }
  });
  const response = await worker.fetch(request, environment());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { monitors: [] });
});

test('accepts a case-insensitive Bearer scheme', async () => {
  const request = new Request('https://worker.example/api/monitors', {
    headers: { Authorization: 'bearer ' + TOKEN }
  });
  const response = await worker.fetch(request, environment());
  assert.equal(response.status, 200);
});

test('rejects missing, incorrect, and malformed bearer tokens', async () => {
  const requests = [
    new Request('https://worker.example/api/monitors'),
    new Request('https://worker.example/api/monitors', { headers: { Authorization: 'Bearer wrong-token' } }),
    new Request('https://worker.example/api/monitors', { headers: { Authorization: TOKEN } })
  ];
  for (const request of requests) {
    const response = await worker.fetch(request, environment());
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  }
});

test('rejects a valid Cloudflare Access identity without the API token', async () => {
  const request = new Request('https://worker.example/api/monitors');
  const response = await worker.fetch(request, environment(), {
    access: { getIdentity: async () => ({ email: 'operator@example.com' }) }
  });
  assert.equal(response.status, 401);
});

test('fails closed when the API token is missing or too short', async () => {
  for (const token of ['', 'short']) {
    const request = new Request('https://worker.example/api/monitors', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const response = await worker.fetch(request, environment({ APIMON_API_TOKEN: token }));
    assert.equal(response.status, 401);
  }
});

test('allows only the configured dashboard origin in CORS preflight', async () => {
  const allowed = await worker.fetch(new Request('https://worker.example/api/monitors', {
    method: 'OPTIONS',
    headers: { Origin: 'https://dashboard.example.com', 'Access-Control-Request-Method': 'POST' }
  }), environment());
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://dashboard.example.com');
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), null);
  assert.match(allowed.headers.get('Access-Control-Allow-Headers'), /Authorization/);

  const denied = await worker.fetch(new Request('https://worker.example/api/monitors', {
    method: 'OPTIONS',
    headers: { Origin: 'https://attacker.example' }
  }), environment());
  assert.equal(denied.status, 403);
});

test('adds non-credentialed CORS headers to bearer-authenticated API responses', async () => {
  const request = new Request('https://worker.example/api/monitors', {
    headers: { Origin: 'https://dashboard.example.com', Authorization: 'Bearer ' + TOKEN }
  });
  const response = await worker.fetch(request, environment());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://dashboard.example.com');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
});

test('rejects requests carrying an unconfigured Origin', async () => {
  const request = new Request('https://worker.example/api/monitors', {
    headers: { Origin: 'https://attacker.example', Authorization: 'Bearer ' + TOKEN }
  });
  const response = await worker.fetch(request, environment());
  assert.equal(response.status, 403);
});
