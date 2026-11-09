import { checkMonitor, validateMonitor } from "./monitoring.js";
import {
  claimDueMonitors,
  createMonitor,
  deleteMonitor,
  getMonitor,
  listCheckResults,
  listMonitors,
  saveCheckResult,
  setMonitorActive,
  updateMonitor
} from "./storage.js";

const json = (data, status = 200) => Response.json(data, { status });
const apiError = (message, status) => json({ error: message }, status);

function authorized(request, env) {
  const expected = env.APIMON_API_TOKEN;
  const supplied = request.headers.get("Authorization") || "";
  return typeof expected === "string" && expected.length >= 32 &&
    supplied === `Bearer ${expected}`;
}

function parseMonitorInput(body, id) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Request body must be a JSON object.");
  return {
    id,
    name: body.name,
    url: body.url,
    enabled: true,
    intervalMinutes: body.intervalMinutes ?? 10,
    timeoutSeconds: body.timeoutSeconds ?? 10,
    expectedStatus: body.expectedStatus ?? 200
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ service: "APIMON Worker", status: "ok" });
    }

    if (!url.pathname.startsWith("/api/")) return apiError("Not found", 404);
    if (!authorized(request, env)) return apiError("Unauthorized", 401);
    if (!env.APIMON_DB) return apiError("Monitoring storage is unavailable.", 503);

    try {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] !== "api" || parts[1] !== "monitors") return apiError("Not found", 404);

      if (parts.length === 2 && request.method === "GET") {
        return json({ monitors: await listMonitors(env.APIMON_DB) });
      }

      if (parts.length === 2 && request.method === "POST") {
        const body = await request.json();
        const id = crypto.randomUUID();
        const monitor = parseMonitorInput(body, id);
        const valid = validateMonitor(monitor);
        const created = await createMonitor(env.APIMON_DB, valid);
        return json({ monitor: created }, 201);
      }

      const id = parts[2];
      if (!id) return apiError("Monitor id is required.", 400);
      const existing = await getMonitor(env.APIMON_DB, id);
      if (!existing) return apiError("Monitor not found.", 404);

      if (parts.length === 4 && parts[3] === "checks" && request.method === "GET") {
        return json({ results: await listCheckResults(env.APIMON_DB, id, url.searchParams.get("limit")) });
      }
      if (parts.length === 4 && parts[3] === "pause" && request.method === "POST") {
        return json({ monitor: await setMonitorActive(env.APIMON_DB, id, false) });
      }
      if (parts.length === 4 && parts[3] === "resume" && request.method === "POST") {
        return json({ monitor: await setMonitorActive(env.APIMON_DB, id, true) });
      }
      if (parts.length === 3 && request.method === "GET") return json({ monitor: existing });
      if (parts.length === 3 && request.method === "PATCH") {
        const body = await request.json();
        const valid = validateMonitor(parseMonitorInput({ ...existing, ...body }, id));
        return json({ monitor: await updateMonitor(env.APIMON_DB, id, valid) });
      }
      if (parts.length === 3 && request.method === "DELETE") {
        await deleteMonitor(env.APIMON_DB, id);
        return new Response(null, { status: 204 });
      }
      return apiError("Not found", 404);
    } catch (error) {
      if (error instanceof SyntaxError) return apiError("Request body must contain valid JSON.", 400);
      if (error instanceof Error && /must|only|interval|timeout|status|URL|hostname|network|port|fragment|credentials/i.test(error.message)) {
        return apiError(error.message, 400);
      }
      console.error(JSON.stringify({ event: "apimon.api.error", message: "Monitor API operation failed." }));
      return apiError("The request could not be completed.", 500);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledChecks(env));
  }
};

export async function runScheduledChecks(env, dependencies = {}) {
  if (!env.APIMON_DB) {
    console.error(JSON.stringify({ event: "apimon.scheduler.storage_unavailable", checkedAt: new Date().toISOString() }));
    return [];
  }

  const now = dependencies.now ?? (() => new Date());
  const due = await claimDueMonitors(env.APIMON_DB, now().toISOString());
  if (due.length === 0) {
    console.log(JSON.stringify({ event: "apimon.scheduler.no_due_monitors", checkedAt: now().toISOString() }));
    return [];
  }

  const results = [];
  for (const monitor of due) {
    const result = await checkMonitor(monitor, dependencies);
    try {
      const persisted = await saveCheckResult(env.APIMON_DB, result);
      results.push(persisted);
      console.log(JSON.stringify({ event: "apimon.monitor.check", ...persisted }));
    } catch {
      console.error(JSON.stringify({
        event: "apimon.monitor.persistence_error",
        monitorId: monitor.id,
        checkedAt: result.checkedAt
      }));
    }
  }

  console.log(JSON.stringify({
    event: "apimon.scheduler.completed",
    checkedAt: now().toISOString(),
    total: due.length,
    persisted: results.length,
    up: results.filter(result => result.status === "UP").length,
    down: results.filter(result => result.status === "DOWN").length
  }));
  return results;
}
