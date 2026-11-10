import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api.js';

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('lists monitors without exposing a service token in browser requests', async () => {
  let request;
  const api = createApiClient('https://api.example.com/', async (url, options) => {
    request = { url, options };
    return response({ monitors: [] });
  });
  assert.deepEqual(await api.listMonitors(), { monitors: [] });
  assert.equal(request.url, 'https://api.example.com/api/monitors');
  assert.equal(request.options.credentials, 'include');
  assert.equal(request.options.headers.Authorization, undefined);
});

test('creates monitors with JSON and browser Access credentials', async () => {
  let request;
  const api = createApiClient('https://api.example.com', async (url, options) => {
    request = { url, options };
    return response({ monitor: { id: 'monitor-1' } }, 201);
  });
  const monitor = { name: 'RetailOS', url: 'https://example.com/health' };
  assert.deepEqual(await api.createMonitor(monitor), { monitor: { id: 'monitor-1' } });
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), monitor);
  assert.equal(request.options.credentials, 'include');
});

test('encodes monitor IDs and returns persisted check history', async () => {
  let requestedUrl;
  const api = createApiClient('https://api.example.com', async url => {
    requestedUrl = url;
    return response({ results: [{ status: 'UP', responseTimeMs: 42 }] });
  });
  const result = await api.getChecks('id/with spaces', 25);
  assert.match(requestedUrl, /id%2Fwith%20spaces\/checks\?limit=25$/);
  assert.equal(result.results[0].responseTimeMs, 42);
});

test('returns null for successful delete responses', async () => {
  const api = createApiClient('https://api.example.com', async () => ({ ok: true, status: 204 }));
  assert.equal(await api.deleteMonitor('monitor-1'), null);
});

test('fails clearly when the production API base URL is missing', async () => {
  const api = createApiClient('');
  await assert.rejects(api.listMonitors(), /VITE_APIMON_API_BASE_URL/);
});

test('maps authentication and API errors to safe user-facing messages', async () => {
  const unauthorizedApi = createApiClient('https://api.example.com', async () => response({ error: 'Unauthorized' }, 401));
  await assert.rejects(unauthorizedApi.listMonitors(), /Access denied/);
  const failedApi = createApiClient('https://api.example.com', async () => response({ error: 'Storage unavailable' }, 503));
  await assert.rejects(failedApi.listMonitors(), /Storage unavailable/);
});

test('reports network failures without exposing implementation details', async () => {
  const api = createApiClient('https://api.example.com', async () => { throw new Error('socket details'); });
  await assert.rejects(api.listMonitors(), /Could not reach the APIMON API/);
});