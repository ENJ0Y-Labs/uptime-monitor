# APIMON System Architecture

**Status:** Proposed initial architecture

## 1. System components

### Frontend — React + Vite

The browser application provides account access, monitor configuration, current status, history, charts, incident views, and notification preferences. It does not execute recurring monitoring checks.

### Backend — Flask

The backend provides the product API and handles authentication, authorization, monitor CRUD, validation, user preferences, query endpoints, and application-level business rules.

The backend is not the recurring scheduler. Its availability must not determine whether previously configured checks execute.

### Worker — Cloudflare Workers

The worker is the independent scheduled execution component. A Cron Trigger wakes it on a schedule. It retrieves due monitor work through a secure worker integration, performs bounded outbound HTTP checks, and persists results.

The worker must handle duplicate invocations and concurrent execution safely. It must not trust monitor URLs or configuration without validation.

### Database — PostgreSQL

PostgreSQL is the initial primary application datastore for accounts, monitor configuration, check results, incidents, and notification preferences. The architecture must define how the worker accesses durable state securely. Do not expose database credentials to the browser.

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

The worker must have an independent route to read due monitor configurations and write results. A later implementation decision must choose and document the exact integration mechanism, authentication, storage ownership, and failure behavior. Do not assume Cloudflare Workers can directly access a private PostgreSQL database without an explicitly configured secure connectivity solution.

## 4. Initial data concepts

- **User:** account and authentication identity.
- **Monitor:** owner, name, URL, interval, timeout, expected status, enabled state, scheduling metadata.
- **CheckResult:** monitor, timestamp, status, HTTP status, response time, safe error category/message.
- **Incident:** monitor, start time, last failure, recovery time, state.
- **NotificationPreference:** user channel and event preferences.
- **NotificationDelivery:** event, attempt, delivery status, timestamp, safe error information.

Exact schemas and migration strategy are implementation decisions and must be documented with the relevant code.

## 5. Scheduling and execution

- Default interval: 10 minutes.
- Initial selectable intervals: 1, 5, 10, 20, and 30 minutes, subject to quotas and product limits.
- Default timeout: 10 seconds.
- Default method: GET.
- Default expected response: HTTP 200.
- Store timestamps in UTC.
- Track next-due time and last execution.
- Prevent overlapping duplicate checks for a monitor.
- Apply concurrency controls and bounded retries.
- Record scheduler execution errors separately from target failures.

Cloudflare Cron Trigger schedules use UTC cron expressions. The exact trigger strategy must be validated against Cloudflare plan limits and the required per-monitor interval semantics before production use. A single trigger can poll due work, but it must not assume every monitor is due at every trigger.

## 6. Security boundaries

- Browser to backend: authenticated HTTPS API.
- Worker to control plane/storage: authenticated service identity with least privilege.
- Worker to target: constrained outbound HTTP client.
- Database: private credentials and least-privilege access.
- Never allow arbitrary user-controlled request headers or request bodies in the MVP.
- Prevent SSRF across DNS resolution and redirects.
- Avoid logging secrets or sensitive response bodies.

## 7. Deployment topology

- Frontend: static web hosting.
- Backend: Flask-compatible application hosting.
- Worker: Cloudflare Workers with Cron Triggers.
- Database: managed PostgreSQL.

Deployments are separate. Each component must have documented environment variables, secrets, health checks, rollback instructions, and operational ownership before production launch.

## 8. Open architecture decisions

These must be resolved before the relevant implementation phase:
1. Worker-to-database integration approach.
2. Whether a queue is needed for due monitor work.
3. Scheduler trigger frequency and due-monitor polling strategy.
4. Minimum interval by plan and provider quotas.
5. Failure threshold and incident state machine.
6. Check-result retention and aggregation policy.
7. Email provider and delivery retry policy.
8. Account roles, team access, and monitor quotas.
