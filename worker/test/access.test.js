import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function environment(overrides = {}) {
  return {
    APIMON_ALLOWED_EMAILS: 'operator@example.com',
    APIMON_ALLOWED_ORIGIN: 'https://dashboard.example.com',
    APIMON_DB: { prepare: () => ({ all: async () => ({ results: [] }) }) },
    ...overrides
  };
}

function accessContext(email) {
  return { access: { getIdentity: async () => ({ email }) } };
}

test('allows a Cloudflare Access identity only when its email is allowlisted', async () => {
  const request = new Request('https://worker.example/api/monitors');
  const response = await worker.fetch(request, environment(), accessContext('operator@example.com'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { monitors: [] });
});

test('rejects a valid Cloudflare Access identity outside the email allowlist', async () => {
  const request = new Request('https://worker.example/api/monitors');
  const response = await worker.fetch(request, environment(), accessContext('stranger@example.com'));
  assert.equal(response.status, 401);
});

test('fails closed when the Access email allowlist is missing', async () => {
  const request = new Request('https://worker.example/api/monitors');
  const response = await worker.fetch(request, environment({ APIMON_ALLOWED_EMAILS: '' }), accessContext('operator@example.com'));
  assert.equal(response.status, 401);
});

test('allows only the configured dashboard origin in CORS preflight', async () => {
  const allowed = await worker.fetch(new Request('https://worker.example/api/monitors', {
    method: 'OPTIONS',
    headers: { Origin: 'https://dashboard.example.com', 'Access-Control-Request-Method': 'POST' }
  }), environment());
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://dashboard.example.com');
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), 'true');

  const denied = await worker.fetch(new Request('https://worker.example/api/monitors', {
    method: 'OPTIONS',
    headers: { Origin: 'https://attacker.example' }
  }), environment());
  assert.equal(denied.status, 403);
});

test('adds credentialed CORS headers to authenticated API responses', async () => {
  const request = new Request('https://worker.example/api/monitors', {
    headers: { Origin: 'https://dashboard.example.com' }
  });
  const response = await worker.fetch(request, environment(), accessContext('operator@example.com'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://dashboard.example.com');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
});

test('rejects requests carrying an unconfigured Origin', async () => {
  const request = new Request('https://worker.example/api/monitors', {
    headers: { Origin: 'https://attacker.example' }
  });
  const response = await worker.fetch(request, environment(), accessContext('operator@example.com'));
  assert.equal(response.status, 403);
});