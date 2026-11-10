const DEFAULT_TIMEOUT_SECONDS = 10;
const DEFAULT_EXPECTED_STATUS = 200;
const MAX_TARGETS_PER_RUN = 25;
const MAX_URL_LENGTH = 2048;
const SUPPORTED_INTERVALS = new Set([1, 5, 10, 20, 30]);

export function parseAllowedHosts(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map(host => String(host).trim().toLowerCase().replace(/\.$/, "")).filter(Boolean))];
}

function isIpv4Literal(hostname) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

function isNonPublicHostname(hostname) {
  return !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".arpa") ||
    hostname.endsWith(".onion");
}

export function validateMonitor(monitor, options = {}) {
  if (!monitor || typeof monitor !== "object" || Array.isArray(monitor)) throw new Error("Monitor configuration must be an object.");
  if (typeof monitor.id !== "string" || !monitor.id.trim()) throw new Error("Monitor id is required.");
  if (typeof monitor.name !== "string" || !monitor.name.trim() || monitor.name.trim().length > 80) throw new Error("Monitor name is required and must not exceed 80 characters.");
  if (typeof monitor.enabled !== "boolean") throw new Error("Monitor enabled must be a boolean.");
  if (monitor.enabled === false) return { ...monitor, enabled: false };

  let url;
  if (typeof monitor.url !== "string" || monitor.url.length > MAX_URL_LENGTH) throw new Error("Monitor URL is missing or too long.");
  try { url = new URL(monitor.url); } catch { throw new Error("Monitor URL must be an absolute URL."); }

  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS monitor URLs are supported.");
  if (!url.hostname || url.username || url.password) throw new Error("Monitor URL must have a hostname and cannot contain credentials.");

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname.startsWith("[") || isIpv4Literal(hostname) || isNonPublicHostname(hostname)) {
    throw new Error("IP literals, local names, and non-public network targets are not permitted.");
  }

  const expectedPort = url.protocol === "https:" ? "443" : "80";
  if (url.port && url.port !== expectedPort) throw new Error("Only the standard port for the selected HTTP scheme is permitted.");
  if (url.hash) throw new Error("Monitor URLs must not contain fragments.");

  const allowedHosts = parseAllowedHosts(options.allowedHosts);
  if (options.requireAllowedHost && allowedHosts.length === 0) {
    throw new Error("Target hostname allowlist is not configured.");
  }
  if (allowedHosts.length && !allowedHosts.includes(hostname)) {
    throw new Error("Target hostname is not approved for monitoring.");
  }

  const intervalMinutes = Number(monitor.intervalMinutes ?? 10);
  const timeoutSeconds = Number(monitor.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS);
  const expectedStatus = Number(monitor.expectedStatus ?? DEFAULT_EXPECTED_STATUS);
  if (!Number.isInteger(intervalMinutes) || !SUPPORTED_INTERVALS.has(intervalMinutes)) {
    throw new Error("Interval must be one of 1, 5, 10, 20, or 30 minutes.");
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 30) {
    throw new Error("Timeout must be a whole number between 1 and 30 seconds.");
  }
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) {
    throw new Error("Expected HTTP status must be a whole number between 100 and 599.");
  }

  return {
    id: monitor.id.trim(),
    name: monitor.name.trim(),
    url: url.toString(),
    enabled: true,
    intervalMinutes,
    timeoutSeconds,
    expectedStatus
  };
}

export function loadMonitors(rawConfig, options = {}) {
  if (!rawConfig || !rawConfig.trim()) return [];
  let parsed;
  try { parsed = JSON.parse(rawConfig); } catch {
    throw new Error("APIMON_MONITORS must contain valid JSON.");
  }
  if (!Array.isArray(parsed)) throw new Error("APIMON_MONITORS must be a JSON array.");
  if (parsed.length > MAX_TARGETS_PER_RUN) throw new Error(`A scheduled batch cannot exceed ${MAX_TARGETS_PER_RUN} monitors.`);
  return parsed.map(monitor => validateMonitor(monitor, options)).filter(monitor => monitor.enabled);
}

export async function checkMonitor(monitor, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const checkedAt = now().toISOString();
  let target;
  try {
    target = validateMonitor(monitor, {
      allowedHosts: options.allowedHosts,
      requireAllowedHost: options.requireAllowedHost
    });
  } catch {
    return {
      monitorId: monitor?.id ?? null,
      monitorName: monitor?.name ?? null,
      status: "DOWN",
      httpStatusCode: null,
      responseTimeMs: null,
      checkedAt,
      errorCategory: "target_rejected",
      errorMessage: "The configured target failed APIMON safety validation."
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
    try { await response.body?.cancel(); } catch { /* The response body is intentionally ignored. */ }
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

export async function runMonitorBatch(monitors, options = {}) {
  const results = [];
  for (const monitor of monitors) {
    try {
      results.push(await checkMonitor(monitor, options));
    } catch {
      results.push({
        monitorId: monitor.id,
        monitorName: monitor.name,
        status: "DOWN",
        httpStatusCode: null,
        responseTimeMs: null,
        checkedAt: (options.now ?? (() => new Date()))().toISOString(),
        errorCategory: "monitor_execution_error",
        errorMessage: "APIMON could not execute this monitor check."
      });
    }
  }
  return results;
}
