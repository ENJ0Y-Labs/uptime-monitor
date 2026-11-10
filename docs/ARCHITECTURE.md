# APIMON System Architecture

**Status:** Phase 6 deployment hardening is implemented on the feature branch; Cloudflare account configuration, DNS/Access setup, production deployment, and live acceptance remain pending

## 1. System components

### Frontend — React + Vite

The browser application provides account access, monitor configuration, current status, history, charts, incident views, and notification preferences. It does not execute recurring monitoring checks.

### Backend — Flask

The backend provides the product API and handles authentication, authorization, monitor CRUD, validation, user preferences, query endpoints, and application-level business rules.

The backend is not the recurring scheduler. Its availability must not determine whether previously configured checks execute.

### Worker — Cloudflare Workers

The Worker is the independent scheduled execution component. Its Cron Trigger polls D1 every minute (`* * * * *`) and claims only monitors whose `next_check_at` is due. It performs bounded HTTP GET checks and persists each result in D1. Per-monitor intervals are 1, 5, 10, 20, or 30 minutes.

The worker must handle duplicate invocations and concurrent execution safely. It must not trust monitor URLs or configuration without validation.

### Database — Cloudflare D1

The Phase 5 shared-workspace monitor API and scheduled Worker use Cloudflare D1 for monitor configuration, scheduling metadata, and check history. The database is bound to the Worker as `APIMON_DB`; the dashboard never connects to D1 directly. Account ownership and any future PostgreSQL integration are separate work.

## 2. High-level flow

1. User submits a monitor through the frontend.
2. Flask authenticates the user, validates the request and target, and persists the monitor.
3. The worker's scheduled invocation identifies due monitors.
4. The worker executes bounded HTTP GET checks.
5. Results are persisted with UTC timestamps and measured latency.
6. Backend queries expose current status, history, and incidents to authorized users.
7. Notification processing sends configured failure and recovery messages.

## 3. Critical independence boundary

The scheduler must not run as a background thread, Flask request hook, or process hosted inside the application being monitored. A sleeping or unavailable monitored service must not stop the scheduler from checking it.

The Worker now reads and writes durable monitor and check-result records in D1. Its API supports Cloudflare Access-authenticated dashboard requests and a shared service token for trusted server-to-server clients. The React frontend now reads and writes monitor configuration and check history through the Worker API. In production, Cloudflare Access authenticates the operator; the Worker reads the signed-in identity from ctx.access and checks it against APIMON_ALLOWED_EMAILS. The browser never receives APIMON_API_TOKEN. A local Vite development proxy adds the local service token on the server side. Monitor settings and check results remain in D1. Per-user ownership and PostgreSQL synchronization remain later work.

## Dashboard-to-Worker integration

- The frontend base URL is configured with VITE_APIMON_API_BASE_URL.
- Production browser requests use credentialed CORS and Cloudflare Access. The Worker accepts only the configured APIMON_ALLOWED_ORIGIN.
- The Worker supports both allowlisted Cloudflare Access identities and a bearer service token for trusted server-side clients.
- The frontend refreshes monitor data and recent history on load, on demand, and every 60 seconds. This refresh is read-only and does not invoke a scheduled check.
- The dashboard's response-time chart is derived only from persisted check-result responseTimeMs values.
- The current Access allowlist grants access to one shared workspace; it does not implement account registration or per-user monitor ownership.

## 4. Initial data concepts

- **User:** account and authentication identity.
- **Monitor:** owner, name, URL, interval, timeout, expected status, enabled state, scheduling metadata.
- **CheckResult:** monitor, timestamp, status, HTTP status, response time, safe error category/message.
- **Incident:** monitor, start time, last failure, recovery time, state.
- **NotificationPreference:** user channel and event preferences.
- **NotificationDelivery:** event, attempt, delivery status, timestamp, safe error information.

Exact schemas and migration strategy are implementation decisions and must be documented with the relevant code.

## 5. Scheduling and execution

- Cron schedule: every minute (`* * * * *`), UTC. The Worker polls due work from D1.
- Per-monitor intervals: 1, 5, 10, 20, and 30 minutes. RetailOS is configured for 10 minutes.
- Do not change the Worker Cron to every 10 minutes: it would break the supported 1- and 5-minute intervals.
- Default timeout: 10 seconds.
- Default method: GET.
- Default expected response: HTTP 200.
- Store timestamps in UTC.
- Track next-due time and last execution.
- Claim due monitor rows using a conditional D1 update to avoid duplicate claims.
- Apply a bounded batch size (25 monitors) and per-request timeout.
- Redirects are not followed.
- Persist check results in D1 and emit structured operational logs.
- Record scheduler execution errors separately from target failures.

Cloudflare Cron Trigger schedules use UTC cron expressions. The exact trigger strategy must be validated against Cloudflare plan limits and the required per-monitor interval semantics before production use. A single trigger can poll due work, but it must not assume every monitor is due at every trigger.

## 6. Security boundaries

- Browser to backend: authenticated HTTPS API.
- Worker to control plane/storage: authenticated service identity with least privilege.
- Worker to target: constrained outbound HTTP client.
- Database: private credentials and least-privilege access.
- Never allow arbitrary user-controlled request headers or request bodies in the MVP.
- Reject IP literals, local/reserved hostnames, unsupported schemes/ports, credentials, and any hostname outside `APIMON_ALLOWED_TARGET_HOSTS`.
- Revalidate persisted monitor configuration immediately before each fetch.
- Do not follow redirects; record redirect responses as failed checks.
- The hostname allowlist does not eliminate DNS rebinding. A reviewed egress proxy/network control that resolves and pins globally routable addresses remains a release gate before untrusted monitor registration.
- Avoid logging secrets, full target URLs, or response bodies.

## 7. Deployment topology

- Frontend: Cloudflare Pages.
- API and scheduler: Cloudflare Workers.
- Database: Cloudflare D1 bound as `APIMON_DB`.
- Worker Cron Trigger: every minute; monitor-specific intervals are enforced from D1.

The deployment workflow runs tests, applies remote D1 migrations, writes Worker secrets, deploys the Worker, builds the frontend with its public API origin, and publishes Pages assets. Cloudflare Access policies, DNS/custom domains, and the Pages project remain one-time account configuration. See `docs/DEPLOYMENT.md`.

## 8. Phase 3 implementation boundary

The Worker implementation is under `worker/`. It exports a scheduled handler, public `/health` and `/ready` routes, and Access/service-token protected monitor CRUD/history routes. D1 schema and migrations live under `worker/migrations/`. Production monitor creation requires an explicit hostname allowlist; the current allowlist contains only `retailos-server.onrender.com`. The Worker rejects IP literals, local/reserved hostnames, credentials, unsupported schemes/ports, and fragments, revalidates stored targets immediately before checks, and does not follow redirects. These controls do not fully eliminate DNS rebinding. Keep the Access workspace restricted to trusted operators until a reviewed egress control provides verified public-IP resolution and connection pinning.

## 9. Open architecture decisions

These must be resolved before the relevant implementation phase:
1. Worker-to-database integration approach.
2. Whether a queue is needed for due monitor work.
3. Scheduler trigger frequency and due-monitor polling strategy.
4. Minimum interval by plan and provider quotas.
5. Failure threshold and incident state machine.
6. Check-result retention and aggregation policy.
7. Email provider and delivery retry policy.
8. Account roles, team access, and monitor quotas.
