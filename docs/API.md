# APIMON API Contract

**Status:** Proposed Flask user API plus implemented Cloudflare Worker service API. The Worker contract below is the dashboard integration contract for Phase 5.

This document defines the initial HTTP API shape for the APIMON backend. Exact response envelopes and field names must be kept consistent once implementation begins.

## Conventions

- Base path: `/api/v1`.
- JSON request and response bodies.
- HTTPS in deployed environments.
- Authentication required except for explicitly public operational endpoints.
- Timestamps use ISO 8601 UTC.
- Pagination required for history and incident collections.
- Validate all input server-side.
- Return safe errors without stack traces, secrets, or internal network details.

## Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Start an authenticated session |
| POST | `/auth/logout` | End the current session |
| GET | `/auth/me` | Return the current account |

The implementation must select and document the session strategy, cookie protections, CSRF approach, password hashing, and account recovery flow.

## Monitors

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/monitors` | List monitors owned by the current user |
| POST | `/monitors` | Create a monitor |
| GET | `/monitors/{monitor_id}` | Retrieve monitor details |
| PATCH | `/monitors/{monitor_id}` | Update monitor configuration |
| DELETE | `/monitors/{monitor_id}` | Delete a monitor |
| POST | `/monitors/{monitor_id}/pause` | Pause a monitor |
| POST | `/monitors/{monitor_id}/resume` | Resume a monitor |
| POST | `/monitors/{monitor_id}/checks` | Request a rate-limited manual check |

### Create monitor request

Proposed fields:

- `name`: required display name.
- `url`: required absolute HTTP or HTTPS URL.
- `interval_minutes`: supported interval; default 10.
- `timeout_seconds`: positive bounded timeout; default 10.
- `expected_status_code`: expected HTTP status; default 200.

The server must reject unsupported intervals, unsafe URLs, prohibited destinations, and invalid values.

## Check history

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/monitors/{monitor_id}/checks` | Paginated check history |

Proposed check fields:
- `id`
- `monitor_id`
- `checked_at` (UTC)
- `status` (`UP` or `DOWN`)
- `http_status_code` (nullable)
- `response_time_ms` (nullable)
- `error_category` (nullable)
- `error_message` (nullable, sanitized)

## Incidents

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/incidents` | List incidents visible to the current user |
| GET | `/incidents/{incident_id}` | Retrieve incident details |

Incident fields include monitor, start time, last failure time, recovery time, and current state.

## Dashboard summary

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/dashboard/summary` | Return monitor counts and summary metrics |

Uptime and latency metrics must identify their time window and calculation method.

## Worker integration

The worker requires a secure service-to-service mechanism to:
- Claim or retrieve due monitor work.
- Persist check outcomes.
- Record scheduler execution metadata.

These internal endpoints or storage interfaces must not be exposed as ordinary user endpoints. The implementation must use a dedicated service identity, least-privilege credentials, idempotency controls, and request authentication. Exact paths and payloads are intentionally deferred until the worker/database integration decision is made.


## Implemented Worker API contract (dashboard integration)

The React dashboard uses the Cloudflare Worker API directly. The Worker API is a single protected workspace interface, not a per-user account API. Do not expose its service token to browser code.

### Base URL and authentication

- Base URL: the deployed Worker API origin, configured in the frontend with VITE_APIMON_API_BASE_URL.
- Browser authentication: Cloudflare Access protects the Worker API. The Worker reads the authenticated identity from the Workers Access request context and checks its email against APIMON_ALLOWED_EMAILS.
- Server-to-server authentication: trusted clients may continue using Authorization: Bearer APIMON_API_TOKEN.
- Browser requests use credentialed CORS. APIMON_ALLOWED_ORIGIN must exactly match the deployed dashboard origin.
- The service token must never be placed in a VITE_ variable, HTML, JavaScript bundle, browser storage, or browser request header.

### Routes and response envelopes

| Method | Route | Success response |
|---|---|---|
| GET | /health | { service, status } |
| GET | /api/monitors | { monitors: Monitor[] } |
| POST | /api/monitors | { monitor: Monitor } with HTTP 201 |
| GET | /api/monitors/{id} | { monitor: Monitor } |
| PATCH | /api/monitors/{id} | { monitor: Monitor } |
| DELETE | /api/monitors/{id} | HTTP 204, empty body |
| POST | /api/monitors/{id}/pause | { monitor: Monitor } |
| POST | /api/monitors/{id}/resume | { monitor: Monitor } |
| GET | /api/monitors/{id}/checks?limit=50 | { results: CheckResult[] } |

### Monitor fields

Create and update requests accept:

- name: required string, maximum 80 characters.
- url: absolute HTTP or HTTPS URL.
- intervalMinutes: one of 1, 5, 10, 20, or 30; default 10.
- timeoutSeconds: integer from 1 to 30; default 10.
- expectedStatus: integer from 100 to 599; default 200.

Monitor responses include id, name, url, intervalMinutes, timeoutSeconds, expectedStatus, enabled, createdAt, updatedAt, nextCheckAt, and lastCheckedAt.

### Check result fields

Each persisted result includes id, monitorId, status (UP or DOWN), httpStatusCode, responseTimeMs, checkedAt (UTC), errorCategory, and errorMessage. The history endpoint returns newest results first. The dashboard uses the first result as the latest recorded status and uses persisted responseTimeMs values for the response-time chart.

The dashboard refreshes data on page load, on user request, and every 60 seconds. Refreshing the dashboard does not trigger a scheduled check.

### Access and CORS deployment requirements

Configure Cloudflare Access to protect the Worker API. Allow only the intended operators in the Access policy and configure the same exact email addresses in APIMON_ALLOWED_EMAILS. Set APIMON_ALLOWED_ORIGIN to the exact dashboard origin.

Browser CORS preflight requests use OPTIONS and do not carry the user's Access session credentials. Configure the Access policy to let OPTIONS preflight requests reach the Worker. The Worker responds only for the configured origin and returns no monitor data to preflight requests.

The Worker API currently grants allowlisted operators access to the shared workspace. Per-user monitor ownership, registration, and account-level authorization are not implemented by this phase.

## Standard failure behavior

Use appropriate HTTP statuses:
- `400`: malformed or invalid request.
- `401`: unauthenticated.
- `403`: authenticated but unauthorized.
- `404`: resource not found or not visible to the caller.
- `409`: conflicting state or duplicate operation.
- `422`: semantically invalid input, if adopted consistently.
- `429`: rate or quota limit exceeded.
- `500`: unexpected server failure with a safe public message.

Do not reveal whether another user's monitor exists.
