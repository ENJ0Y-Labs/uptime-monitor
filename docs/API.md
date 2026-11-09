# APIMON API Contract

**Status:** Proposed Flask user API; Worker service routes are implemented separately in Phase 4.

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
