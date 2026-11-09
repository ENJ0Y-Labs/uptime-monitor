import test from "node:test";
import assert from "node:assert/strict";
import { checkMonitor, loadMonitors, runMonitorBatch } from "../src/monitoring.js";
import { runScheduledChecks } from "../src/index.js";

const monitor = {
  id: "retailos-backend",
  name: "RetailOS Backend",
  url: "https://retailos-server.onrender.com/health",
  enabled: true,
  intervalMinutes: 10,
  timeoutSeconds: 10,
  expectedStatus: 200
};

test("loads valid active monitor configuration", () => {
  assert.equal(loadMonitors(JSON.stringify([monitor])).length, 1);
});
test("ignores paused monitors", () => {
  assert.equal(loadMonitors(JSON.stringify([{ ...monitor, enabled: false }])).length, 0);
});
test("rejects malformed configuration and more than 25 monitors", () => {
  assert.throws(() => loadMonitors("{bad"), /valid JSON/);
  assert.throws(() => loadMonitors(JSON.stringify(Array.from({ length: 26 }, (_, i) => ({ ...monitor, id: String(i) })))), /cannot exceed/);
});
test("rejects local, private, credentialed, non-http and non-standard port URLs", () => {
  for (const url of [
    "http://localhost/health",
    "http://127.0.0.1/health",
    "http://10.0.0.2/health",
    "http://192.168.1.2/health",
    "http://172.16.0.1/health",
    "http://user:pass@example.com/health",
    "ftp://example.com/file",
    "https://example.com:8443/health"
  ]) assert.throws(() => loadMonitors(JSON.stringify([{ ...monitor, url }])));
});
test("rejects interval other than the Phase 3 ten-minute schedule", () => {
  assert.throws(() => loadMonitors(JSON.stringify([{ ...monitor, intervalMinutes: 5 }])), /10-minute interval/);
});
test("records a successful expected HTTP 200 response and UTC timestamp", async () => {
  const result = await checkMonitor(monitor, {
    fetchImpl: async () => new Response("ok", { status: 200 }),
    now: () => new Date("2026-11-09T12:00:00.000Z"),
    monotonicNow: (() => { let n = 100; return () => n += 17; })()
  });
  assert.equal(result.status, "UP");
  assert.equal(result.httpStatusCode, 200);
  assert.equal(result.responseTimeMs, 17);
  assert.equal(result.checkedAt, "2026-11-09T12:00:00.000Z");
  assert.equal(result.errorMessage, null);
});
test("records unexpected HTTP status as a failure", async () => {
  const result = await checkMonitor(monitor, { fetchImpl: async () => new Response("missing", { status: 503 }) });
  assert.equal(result.status, "DOWN");
  assert.equal(result.errorCategory, "unexpected_http_status");
  assert.match(result.errorMessage, /Expected HTTP 200 but received HTTP 503/);
});
test("does not follow redirects", async () => {
  const result = await checkMonitor(monitor, { fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, "manual");
    return new Response(null, { status: 302 });
  } });
  assert.equal(result.status, "DOWN");
  assert.equal(result.errorCategory, "redirect_blocked");
});
test("records timeout and connection failures with safe messages", async () => {
  const timeout = await checkMonitor({ ...monitor, timeoutSeconds: 1 }, { fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); }, { once: true });
  }) });
  assert.equal(timeout.errorCategory, "timeout");
  const connection = await checkMonitor(monitor, { fetchImpl: async () => { throw new Error("internal host 10.0.0.1 refused"); } });
  assert.equal(connection.errorCategory, "connection_error");
  assert.equal(connection.errorMessage, "Could not connect to the target service.");
});
test("one failed monitor does not prevent later monitors from being checked", async () => {
  let calls = 0;
  const results = await runMonitorBatch([monitor, { ...monitor, id: "second" }], {
    fetchImpl: async () => { calls++; if (calls === 1) throw new Error("offline"); return new Response("ok", { status: 200 }); }
  });
  assert.equal(results.length, 2);
  assert.equal(results[0].status, "DOWN");
  assert.equal(results[1].status, "UP");
});
test("scheduled handler returns structured results", async () => {
  const results = await runScheduledChecks({ APIMON_MONITORS: JSON.stringify([monitor]) }, {
    fetchImpl: async () => new Response("ok", { status: 200 })
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].monitorId, monitor.id);
});
