export async function checkMonitor(monitor, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const checkedAt = now().toISOString();

  // Revalidate the persisted target immediately before every outbound request.
  // A monitor can become stale or be modified outside the normal creation path.
  let target;
  try {
    target = validateMonitor(monitor);
  } catch {
    return {
      monitorId: monitor?.id ?? null,
      monitorName: monitor?.name ?? null,
      status: "DOWN",
      httpStatusCode: null,
      responseTimeMs: null,
      checkedAt,
      errorCategory: "target_rejected",
      errorMessage: "The configured target failed APIMON's safety validation."
    };
  }

  const startedAt = monotonicNow();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("APIMON request timeout"), target.timeoutSeconds * 1000);

  try {
    const response = await fetchImpl(target.url, {
      method: "GET",
      headers: { "User-Agent": "APIMON-Monitor/1.0", "Accept": "*/*" },
      redirect: "manual",
      signal: controller.signal
    });
    const responseTimeMs = Math.max(0, Math.round(monotonicNow() - startedAt));
    const success = response.status === target.expectedStatus;
    return {
      monitorId: target.id,
      monitorName: target.name,
      status: success ? "UP" : "DOWN",
      httpStatusCode: response.status,
      responseTimeMs,
      checkedAt,
      errorCategory: success ? null : (response.status >= 300 && response.status < 400 ? "redirect_blocked" : "unexpected_http_status"),
      errorMessage: success ? null : (response.status >= 300 && response.status < 400
        ? "Redirect responses are not followed by APIMON."
        : `Expected HTTP ${target.expectedStatus} but received HTTP ${response.status}.`)
    };
  } catch (error) {
    const responseTimeMs = Math.max(0, Math.round(monotonicNow() - startedAt));
    const timedOut = error?.name === "AbortError" || controller.signal.aborted;
    return {
      monitorId: target.id,
      monitorName: target.name,
      status: "DOWN",
      httpStatusCode: null,
      responseTimeMs,
      checkedAt,
      errorCategory: timedOut ? "timeout" : "connection_error",
      errorMessage: timedOut ? `Request timed out after ${target.timeoutSeconds} seconds.` : "Could not connect to the target service."
    };
  } finally {
    clearTimeout(timeout);
  }
}
