import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResponseTimeChart,
  fetchDashboardSnapshot,
  readCheckHistoryResponse,
  readMonitorResponse,
  readMonitorsResponse
} from '../src/dashboard-data.js';

const monitor = {
  id: 'monitor-1',
  name: 'RetailOS E2E Test',
  url: 'https://retailos-server.onrender.com/health',
  enabled: true,
  intervalMinutes: 1,
  timeoutSeconds: 10,
  expectedStatus: 200
};

const checks = [
  { id: 'newer', monitorId: monitor.id, status: 'DOWN', httpStatusCode: 503, responseTimeMs: 125, checkedAt: '2026-11-10T12:02:00.000Z' },
  { id: 'older', monitorId: monitor.id, status: 'UP', httpStatusCode: 200, responseTimeMs: 50, checkedAt: '2026-11-10T12:00:00.000Z' }
];

test('reads API monitor and history envelopes without losing the latest-first API order', () => {
  assert.deepEqual(readMonitorsResponse({ monitors: [monitor] }), [monitor]);
  assert.deepEqual(readMonitorResponse({ monitor }), monitor);
  assert.deepEqual(readCheckHistoryResponse({ results: checks }), checks);
  assert.equal(readCheckHistoryResponse({ results: checks })[0].status, 'DOWN');
});

test('rejects invalid monitor and check history API responses', () => {
  assert.throws(() => readMonitorsResponse({}), /invalid monitor list response/);
  assert.throws(() => readMonitorsResponse({ monitors: [{ id: 'missing-fields' }] }), /invalid monitor list response/);
  assert.throws(() => readMonitorResponse({ monitor: null }), /invalid monitor response/);
  assert.throws(() => readCheckHistoryResponse({ results: {} }), /invalid check history response/);
  assert.throws(() => readCheckHistoryResponse({ results: [{ ...checks[0], checkedAt: 'invalid' }] }), /invalid check history response/);
});

test('does not produce a partial dashboard snapshot when history loading fails', async () => {
  const previous = { monitors: [monitor], checkData: { [monitor.id]: checks } };
  const api = {
    listMonitors: async () => ({ monitors: [monitor] }),
    getChecks: async () => { throw new Error('history unavailable'); }
  };

  await assert.rejects(fetchDashboardSnapshot(api), /history unavailable/);
  assert.deepEqual(previous, { monitors: [monitor], checkData: { [monitor.id]: checks } });
});

test('builds a timestamp-scaled chronological chart from actual response times', () => {
  const chart = buildResponseTimeChart(checks);
  assert.deepEqual(chart.points.map(point => point.id), ['older', 'newer']);
  assert.deepEqual(chart.points.map(point => point.x), [18, 582]);
  assert.equal(chart.points[0].responseTimeMs, 50);
  assert.equal(chart.points[1].responseTimeMs, 125);
  assert.equal(chart.line, chart.points.map(point => point.x + ',' + point.y).join(' '));
});

test('omits empty, missing, negative, non-numeric and invalid-timestamp chart points', () => {
  const chart = buildResponseTimeChart([
    ...checks,
    { id: 'null-time', checkedAt: '2026-11-10T12:03:00.000Z', responseTimeMs: null },
    { id: 'missing-time', checkedAt: '2026-11-10T12:03:00.000Z' },
    { id: 'negative-time', checkedAt: '2026-11-10T12:03:00.000Z', responseTimeMs: -1 },
    { id: 'text-time', checkedAt: '2026-11-10T12:03:00.000Z', responseTimeMs: 'fast' },
    { id: 'invalid-date', checkedAt: 'not-a-date', responseTimeMs: 42 }
  ]);
  assert.deepEqual(chart.points.map(point => point.id), ['older', 'newer']);
  assert.deepEqual(buildResponseTimeChart([]), { points: [], line: '' });
  assert.deepEqual(buildResponseTimeChart([{ checkedAt: 'invalid', responseTimeMs: 10 }]), { points: [], line: '' });
});
