const DEFAULT_TIMEOUT_SECONDS = 10;
const DEFAULT_EXPECTED_STATUS = 200;
const MAX_TARGETS_PER_RUN = 25;
const MAX_URL_LENGTH = 2048;
const SUPPORTED_INTERVALS = new Set([1, 5, 10, 20, 30]);
// Private/reserved IPv4 ranges (RFC 1918, loopback, link-local, multicast, etc.)
const PRIVATE_IPV4_RANGES = [
  { start: "10.0.0.0", end: "10.255.255.255", name: "RFC 1918 Class A" },
  { start: "172.16.0.0", end: "172.31.255.255", name: "RFC 1918 Class B" },
  { start: "192.168.0.0", end: "192.168.255.255", name: "RFC 1918 Class C" },
  { start: "127.0.0.0", end: "127.255.255.255", name: "Loopback" },
  { start: "169.254.0.0", end: "169.254.255.255", name: "Link-local (APIPA)" },
  { start: "224.0.0.0", end: "239.255.255.255", name: "Multicast" },
  { start: "240.0.0.0", end: "255.255.255.255", name: "Reserved" },
];

// Private/reserved IPv6 prefixes (RFC 4291, unique local, loopback, multicast)
const PRIVATE_IPV6_PREFIXES = [
  { prefix: "::1", name: "IPv6 loopback" },
  { prefix: "fc00::", name: "IPv6 unique local (ULA)" },
  { prefix: "fe80::", name: "IPv6 link-local" },
  { prefix: "ff00::", name: "IPv6 multicast" },
];

// Blocked TLDs that are never legitimate monitoring targets
const BLOCKED_TLDS = new Set([
  "localhost",
  "local",
  "invalid",
  "example",
  "test",
  "arpa",
  "onion",
]);

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

/**
 * Convert an IPv4 address string to a 32-bit integer for comparison.
 */
function ipv4ToInteger(ip) {
  const parts = ip
    .split(".")
    .map((part) => {
      const p = Number(part);
      return isNaN(p) ? 0 : p;
    });
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
}

/**
 * Check if an IPv4 integer is within a range [startInt, endInt].
 */
function ipv4InRange(ipInt, startInt, endInt) {
  return ipInt >= startInt && ipInt <= endInt;
}

/**
 * Check if an IPv4 address is in a private/reserved range.
 * @param {string} ip - IPv4 address in dotted-decimal notation
 * @returns {string|null} Description of the private range, or null if public
 */
function isPrivateIpv4(ip) {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
  const ipInt = ipv4ToInteger(ip);

  for (const range of PRIVATE_IPV4_RANGES) {
    const parts = range.start.split(".").map(Number);
    const startInt = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
    const endParts = range.end.split(".").map(Number);
    const endInt = (endParts[0] << 24) | (endParts[1] << 16) | (endParts[2] << 8) | endParts[3];
    if (ipv4InRange(ipInt, startInt, endInt)) {
      return range.name;
    }
  }
  return null;
}

/**
 * Check if an IPv6 address is a private/reserved address.
 * @param {string} ip - IPv6 address
 * @returns {string|null} Description of the private range, or null if public
 */
function isPrivateIpv6(ip) {
  if (!ip.includes(":")) return null;

  for (const entry of PRIVATE_IPV6_PREFIXES) {
    const regex = new RegExp(`^${entry.prefix}`);
    if (regex.test(ip)) {
      return entry.name;
    }
  }
  // Check for unspecified address ::0
  if (ip === "::") return "IPv6 unspecified";
  return null;
}

/**
 * Check if a hostname string ends with a blocked/unsafe TLD.
 * @param {string} hostname - Lowercase hostname
 * @returns {boolean} true if the hostname uses a blocked TLD
 */
function isBlockedTld(hostname) {
  const parts = hostname.split(".");
  if (parts.length < 2) return false;
  const tld = parts[parts.length - 1].toLowerCase();
  return BLOCKED_TLDS.has(tld);
}

/**
 * Parse allowed hosts into a Set for efficient lookup.
 * @param {string|string[]} value - Comma-separated or array of hostnames
 * @returns {Set} Set of allowed hostnames (lowercase, trimmed, without trailing dot)
 */
export function parseAllowedHostsSet(value) {
  const values = value instanceof Set ? [...value] : Array.isArray(value) ? value : String(value || "").split(",");
  return new Set(
    values
      .map((host) => String(host).trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean)
  );
}

/**
 * Validate the resolved destination IP against private/reserved ranges.
 * Provides DNS-rebinding protection through IP address validation.
 * 
 * NOTE: In Cloudflare Worker runtime, the actual resolved IP of an outbound fetch
 * cannot be reliably determined due to the architecture. This function is designed
 * to be called with a known resolved IP (e.g., from external DNS resolution or
 * provided via options.resolvedIp). For true DNS-rebinding protection, network-level
 * egress restrictions (Cloudflare Access, firewall rules, outbound traffic policies)
 * must be employed.
 * 
 * @param {string} hostname - The monitor URL hostname (lowercase)
 * @param {string} resolvedIp - The resolved IP address to validate
 * @param {Set} allowedHosts - Set of approved hostnames from options
 * @returns {{safe: boolean, message: string|null}} Validation result
 */
function validateDestinationIp(hostname, resolvedIp, allowedHosts) {
  const result = { safe: true, message: null };

  // 1. Check for blocked TLDs (localhost, local, etc.) - hostname level
  if (isBlockedTld(hostname)) {
    result.safe = false;
    result.message = `Hostname "${hostname}" uses a blocked TLD and cannot be monitored.`;
    return result;
  }

  // 2. If no resolved IP provided, document the limitation
  // (In pure Worker environment, we cannot reliably get the resolved IP)
  if (!resolvedIp) {
    // Still validate the hostname against the allowlist for config-time safety
    if (allowedHosts.size > 0 && !allowedHosts.has(hostname)) {
      result.safe = false;
      result.message = `Hostname "${hostname}" is not in the approved allowlist.`;
    }
    // Return with info about the limitation
    const infoMessage =
      "DNS rebinding protection not enforced at runtime: resolved IP not available in Worker environment. " +
      "Hostname allowlist provides configuration-time safety. " +
      "For true DNS-rebinding protection, configure Cloudflare Access/egress policies " +
      "to restrict outbound connections to approved destinations.";
    return { safe: true, message: result.message || infoMessage };
  }

  // 3. Validate the resolved IPv4 address
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(resolvedIp)) {
    const privateRange = isPrivateIpv4(resolvedIp);
    if (privateRange) {
      result.safe = false;
      result.message = `Resolved IP ${resolvedIp} is in a private/reserved range (${privateRange}). DNS rebinding detected or disallowed target.`;
    }
  }

  // 4. Validate the resolved IPv6 address
  if (resolvedIp.includes(":")) {
    const privateRange = isPrivateIpv6(resolvedIp);
    if (privateRange) {
      result.safe = false;
      result.message = `Resolved IP ${resolvedIp} is a ${privateRange}. DNS rebinding detected or disallowed target.`;
    }
  }

  // 5. Check allowlist if configured
  if (allowedHosts.size > 0 && !allowedHosts.has(hostname)) {
    result.safe = false;
    if (!result.message) {
      result.message = `Hostname "${hostname}" is not in the approved allowlist.`;
    }
  }

  return result;
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

  const allowedHosts = parseAllowedHostsSet(options.allowedHosts);
  if (options.requireAllowedHost && allowedHosts.size === 0) {
    throw new Error("Target hostname allowlist is not configured.");
  }
  if (allowedHosts.size > 0 && !allowedHosts.has(hostname)) {
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
    expectedStatus,
    hostname,
    allowedHosts,
    validated: true
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

  // A supplied IP can be screened, but Cloudflare Workers does not expose or pin
  // the IP used by fetch(). This is a preflight check, not complete DNS-rebinding protection.
  const destination = validateDestinationIp(target.hostname, options.resolvedIp, target.allowedHosts);
  const dnsRebindingWarning = {
    level: destination.safe ? (options.resolvedIp ? "info" : "warning") : "error",
    message: destination.message || "The supplied destination IP passed the private/reserved address check; the Worker fetch connection is not pinned to this IP."
  };
  if (!destination.safe) {
    return {
      monitorId: target.id,
      monitorName: target.name,
      status: "DOWN",
      httpStatusCode: null,
      responseTimeMs: null,
      checkedAt,
      errorCategory: "target_rejected",
      errorMessage: "The configured destination failed APIMON safety validation.",
      dnsRebindingWarning
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
        : `Expected HTTP ${target.expectedStatus} but received HTTP ${response.status}.`),
      dnsRebindingWarning
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
      errorMessage: timedOut ? `Request timed out after ${target.timeoutSeconds} seconds.` : "Could not connect to the target service.",
      dnsRebindingWarning
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
