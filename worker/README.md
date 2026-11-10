# APIMON Cloudflare Worker

Scheduled monitoring engine and D1-backed monitor API.

## What it does

- Polls D1 every minute using a Cloudflare Cron Trigger.
- Selects active monitors whose next_check_at is due.
- Sends bounded HTTP GET requests and records each result in D1.
- Stores UTC timestamps, response times, HTTP status, and safe failure details.
- Provides monitor CRUD, pause/resume, and check-history routes.
- Keeps GET /health public at the Worker application layer.

## API routes

| Method | Route | Purpose |
|---|---|---|
| GET | /health | Public service health |
| GET | /api/monitors | List monitors |
| POST | /api/monitors | Create a monitor |
| GET | /api/monitors/:id | Retrieve a monitor |
| PATCH | /api/monitors/:id | Update monitor configuration |
| DELETE | /api/monitors/:id | Delete monitor and cascade its history |
| POST | /api/monitors/:id/pause | Pause scheduled checks |
| POST | /api/monitors/:id/resume | Resume scheduled checks immediately |
| GET | /api/monitors/:id/checks?limit=50 | Read recent check history |

Create and update fields are name, url, intervalMinutes, timeoutSeconds, and expectedStatus. Supported intervals are 1, 5, 10, 20, and 30 minutes. The default interval is 10 minutes, timeout is 10 seconds, and expected status is 200.

## Authentication model

The API supports two server-verified authentication paths:

1. Cloudflare Access for the browser dashboard. Cloudflare authenticates the operator, and the Worker reads the authenticated identity through ctx.access.getIdentity(). The Worker also checks the identity email against APIMON_ALLOWED_EMAILS.
2. APIMON_API_TOKEN for trusted server-to-server clients. This credential must remain on a trusted server and must never be embedded in browser code.

The dashboard does not send APIMON_API_TOKEN. Do not add it to VITE_ variables or local storage.

For production, create a Cloudflare Access application protecting the Worker API hostname and /api/* paths. Restrict its policy to the intended operators. Set these Worker secrets:

- APIMON_ALLOWED_EMAILS: comma-separated, exact email allowlist.
- APIMON_ALLOWED_ORIGIN: exact dashboard origin, including scheme and port if applicable.
- APIMON_API_TOKEN: strong service credential for trusted server-to-server clients only.

The Access policy and Worker email allowlist are both enforced. Do not leave an alternate unprotected route that accepts browser requests. Cloudflare Access must allow OPTIONS preflight requests to reach the Worker because browsers do not send Access credentials with CORS preflight. The Worker validates the exact Origin and returns no data to preflight requests.

The Worker uses credentialed CORS for the one configured dashboard origin. Requests carrying a different Origin are rejected.

## D1 setup

Requirements: Node.js 20+, npm, a Cloudflare account, and Wrangler 4.

From this directory:

~~~bash
npm install
npx wrangler login
npm run db:create
~~~

Copy the returned D1 database ID into database_id in wrangler.toml.

Apply migrations:

~~~bash
npm run db:migrate:local
npm run db:migrate:remote
~~~

## Local development

Create .dev.vars from .dev.vars.example and set a random APIMON_API_TOKEN of at least 32 characters. Apply the local D1 migration.

~~~bash
npm test
npm run dev
~~~

The Worker package scripts explicitly select worker/wrangler.toml. This is important because the repository root also contains a separate wrangler.jsonc for frontend assets. The local allowed origin defaults to http://127.0.0.1:5173; change it only to the exact origin used for direct browser-to-Worker requests. Local dashboard requests use the same-origin Vite proxy instead, which removes the browser Origin header and adds the service token server-side.

Local development authenticates through the Vite proxy's service token. It does not emulate Cloudflare Access identity; verify Access policies, identity allowlisting, and preflight reachability in the deployed environment.

For the frontend, copy frontend/.env.example to frontend/.env.local. Put the same local token in APIMON_API_TOKEN and set APIMON_API_ORIGIN to http://127.0.0.1:8787. Run the frontend dev server. Its Vite proxy injects the token server-side and removes the browser Origin header; the token is not bundled into the browser.

## Production deployment

1. Apply remote D1 migrations with npm run db:migrate:remote.
2. Set APIMON_API_TOKEN using npx wrangler secret put APIMON_API_TOKEN.
3. Set APIMON_ALLOWED_EMAILS and APIMON_ALLOWED_ORIGIN as Worker secrets.
4. Configure Cloudflare Access for the Worker API hostname and restrict access to the intended operators.
5. Configure the frontend build variable VITE_APIMON_API_BASE_URL with the Worker API origin. This is a public URL, not a secret.
6. Configure the Access policy so OPTIONS preflight requests reach the Worker.
7. Deploy with npm run deploy.
8. Sign in through Cloudflare Access, create a monitor from the dashboard, and confirm it appears in D1.
9. Wait for a scheduled check and confirm the result appears in the dashboard history and response-time chart.
10. Pause, resume, and delete a monitor from the dashboard, then reload the page to verify the stored state.

Do not set APIMON_API_TOKEN as a public Wrangler variable or frontend build variable.

## Result shape

Each check result stores id, monitor_id, status (UP/DOWN), nullable http_status_code, nullable response_time_ms, UTC checked_at, and nullable sanitized error_category / error_message.

## Boundaries and security

- The Worker API currently manages one shared operator workspace. It does not implement end-user accounts or per-monitor ownership.
- URL validation blocks common private IPv4 ranges, localhost, IPv6 literal hosts, credentials, non-HTTP(S) schemes, non-standard ports, and fragments. Redirects are not followed. DNS rebinding and all provider-specific egress paths are not fully mitigated. Do not expose monitor creation to untrusted public users before a dedicated SSRF review.
- D1 stores monitor configuration and history. The dashboard displays persisted check results only; it does not trigger scheduled checks when refreshed.
- Account ownership, PostgreSQL synchronization, incident processing, and retention cleanup remain outside this phase.

## Tests

~~~bash
npm test
~~~

Tests cover Worker behavior, API authentication, Access identity allowlisting, and CORS origin enforcement. Production Access policies, CORS settings, and D1 persistence must still be verified in the deployed Cloudflare environment.
