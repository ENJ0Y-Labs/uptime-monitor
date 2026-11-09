import { loadMonitors, runMonitorBatch } from "./monitoring.js";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ service: "APIMON Worker", status: "ok" });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledChecks(env));
  }
};

export async function runScheduledChecks(env, dependencies = {}) {
  let monitors;
  try {
    monitors = loadMonitors(env.APIMON_MONITORS ?? "");
  } catch (error) {
    console.error(JSON.stringify({
      event: "apimon.scheduler.configuration_error",
      checkedAt: new Date().toISOString(),
      errorMessage: error.message
    }));
    return [];
  }

  if (monitors.length === 0) {
    console.log(JSON.stringify({
      event: "apimon.scheduler.no_active_monitors",
      checkedAt: new Date().toISOString()
    }));
    return [];
  }

  const results = await runMonitorBatch(monitors, dependencies);
  for (const result of results) {
    console.log(JSON.stringify({ event: "apimon.monitor.check", ...result }));
  }
  console.log(JSON.stringify({
    event: "apimon.scheduler.completed",
    checkedAt: new Date().toISOString(),
    total: results.length,
    up: results.filter(result => result.status === "UP").length,
    down: results.filter(result => result.status === "DOWN").length
  }));
  return results;
}
