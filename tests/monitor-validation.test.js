import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMonitor } from '../frontend/src/monitor-validation.js';

const valid = { name: 'RetailOS Backend', url: 'https://retailos-server.onrender.com/health', intervalMinutes: 10, timeoutSeconds: 10, expectedStatus: 200 };

test('accepts the RetailOS monitor configuration', () => {
  assert.deepEqual(validateMonitor(valid), { valid: true, message: '' });
});
test('rejects a missing monitor name', () => {
  assert.equal(validateMonitor({ ...valid, name: '  ' }).valid, false);
});
test('rejects malformed and non-HTTP URLs', () => {
  assert.equal(validateMonitor({ ...valid, url: 'not a URL' }).valid, false);
  assert.equal(validateMonitor({ ...valid, url: 'ftp://example.com' }).valid, false);
});
test('rejects URLs containing embedded credentials', () => {
  assert.equal(validateMonitor({ ...valid, url: 'https://user:pass@example.com/health' }).valid, false);
});
test('rejects unsupported intervals and timeouts', () => {
  assert.equal(validateMonitor({ ...valid, intervalMinutes: 7 }).valid, false);
  assert.equal(validateMonitor({ ...valid, timeoutSeconds: 8 }).valid, false);
});
test('rejects HTTP status values outside 100-599 or non-integers', () => {
  assert.equal(validateMonitor({ ...valid, expectedStatus: 99 }).valid, false);
  assert.equal(validateMonitor({ ...valid, expectedStatus: 600 }).valid, false);
  assert.equal(validateMonitor({ ...valid, expectedStatus: 200.5 }).valid, false);
});
