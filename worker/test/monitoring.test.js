import test from "node:test";
import assert from "node:assert/strict";
import { checkMonitor, loadMonitors, validateMonitor, runMonitorBatch } from "../src/monitoring.js";
import worker from "../src/index.js";

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
  ]) assert.throws(() => validateMonitor({ ...monitor, url }));
});
test("accepts all documented D1 scheduling intervals and rejects unsupported intervals", () => {
  for (const intervalMinutes of [1, 5, 10, 20, 30]) {
    assert.equal(validateMonitor({ ...monitor, intervalMinutes }).intervalMinutes, intervalMinutes);
  }
  assert.throws(() => validateMonitor({ ...monitor, intervalMinutes: 2 }), /1, 5, 10, 20, or 30/);
});

test("revalidates persisted monitor targets immediately before fetching", async () => {
  let fetchCalled = false;
  const result = await checkMonitor({ ...monitor, url: "http://127.0.0.1/admin" }, {
    fetchImpl: async () => { fetchCalled = true; return new Response("unexpected", { status: 200 }); },
    now: () => new Date("2026-11-10T12:00:00.000Z")
  });
  assert.equal(fetchCalled, false);
  assert.equal(result.status, "DOWN");
  assert.equal(result.httpStatusCode, null);
  assert.equal(result.responseTimeMs, null);
  assert.equal(result.errorCategory, "target_rejected");
  assert.equal(result.errorMessage, "The configured target failed APIMON's safety validation.");
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
const TEST_API_TOKEN = "test-only-apimon-token-0123456789abcdef";

function testEnvironment(token) {
  const configuredToken = arguments.length === 0 ? TEST_API_TOKEN : token;
  return {
    ...(configuredToken === undefined ? {} : { APIMON_API_TOKEN: configuredToken }),
    APIMON_DB: { prepare: () => ({ all: async () => ({ results: [] }) }) }
  };
}

test("health endpoint remains public", async () => {
  const response = await worker.fetch(new Request("https://worker.example/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: "APIMON Worker", status: "ok" });
});

test("monitor API rejects requests without the service token", async () => {
  const request = new Request("https://worker.example/api/monitors");
  const response = await worker.fetch(request, testEnvironment());
  assert.equal(response.status, 401);
});

test("monitor API returns 401 for an invalid token", async () => {
  const request = new Request("https://worker.example/api/monitors", {
    headers: { Authorization: "Bearer not-the-test-token" }
  });
  const response = await worker.fetch(request, testEnvironment());
  assert.equal(response.status, 401);
});

test("monitor API returns 401 for an incorrect authorization scheme", async () => {
  const request = new Request("https://worker.example/api/monitors", {
    headers: { Authorization: "Basic not-the-test-token" }
  });
  const response = await worker.fetch(request, testEnvironment());
  assert.equal(response.status, 401);
});

test("monitor API grants access with the correct token", async () => {
  const request = new Request("https://worker.example/api/monitors", {
    headers: { Authorization: `Bearer ${TEST_API_TOKEN}` }
  });
  const response = await worker.fetch(request, testEnvironment());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { monitors: [] });
});

test("empty or missing configured secret fails securely", async () => {
  for (const token of [undefined, ""]) {
    const request = new Request("https://worker.example/api/monitors", {
      headers: { Authorization: `Bearer ${TEST_API_TOKEN}` }
    });
    const response = await worker.fetch(request, testEnvironment(token));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  }
});
