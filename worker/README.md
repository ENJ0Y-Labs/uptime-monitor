# APIMON Cloudflare Worker

Scheduled monitoring engine and D1-backed monitor API.

## What it does

- Polls D1 every minute using a Cloudflare Cron Trigger.
- Selects active monitors whose `next_check_at` is due.
- Sends bounded HTTP GET requests and records each result in D1.
- Stores UTC timestamps, response times, HTTP status, and safe failure details.
- Provides monitor CRUD, pause/resume, and check-history routes.
- Keeps `GET /health` public for liveness and `GET /ready` public for D1/schema readiness.

## API routes

| Method | Route | Purpose |
|---|---|---|
| GET | /health | Public Worker liveness |
| GET | /ready | Public D1 binding and schema readiness |
| GET | /api/monitors | List monitors |
| POST | /api/monitors | Create a monitor |
| GET | /api/monitors/:id | Retrieve a monitor |
| PATCH | /api/monitors/:id | Update monitor configuration |
| DELETE | /api/monitors/:id | Delete monitor and cascade its history |
| POST | /api/monitors/:id/pause | Pause scheduled checks |
| POST | /api/monitors/:id/resume | Resume scheduled checks immediately |
| GET | /api/monitors/:id/checks?limit=50 | Read recent check history |

Create and update fields are name, url, intervalMinutes, timeoutSeconds, and expectedStatus. Supported intervals are 1, 5, 10, 20, and 30 minutes. The default interval is 10 minutes, timeout is 10 seconds, and expected status is 200.

## Authentication and CORS

The API supports two server-verified authentication paths:

1. Cloudflare Access for the browser dashboard. Cloudflare authenticates the operator, and the Worker reads the authenticated identity through `ctx.access.getIdentity()`. The Worker checks the identity email against `APIMON_ALLOWED_EMAILS`.
2. `APIMON_API_TOKEN` for trusted server-to-server clients. This credential must remain on a trusted server and must never be embedded in browser code.

The dashboard does not send `APIMON_API_TOKEN`. Do not add it to `VITE_` variables or local storage.

For production, create a Cloudflare Access application protecting the Worker API hostname and `/api/*` paths. Restrict its policy to the intended operators. The Worker rejects any Origin other than the exact `APIMON_ALLOWED_ORIGIN`. CORS preflight requests receive an empty 204 only for that configured origin. Configure Access so OPTIONS requests reach the Worker without an interactive login redirect.

The service token remains a separate server-to-server authentication path. Do not expose it to the browser or configure an unprotected alternate browser route.

## Target host allowlist and SSRF boundaries

Production monitor creation and updates require an explicit `APIMON_ALLOWED_TARGET_HOSTS` allowlist. The committed Wrangler configuration currently allows only `retailos-server.onrender.com`. Add other hostnames only through a reviewed change. The Worker rejects IP literals, localhost/local/reserved hostnames, credentials, non-HTTP(S) schemes, non-standard ports, and fragments.

Every stored monitor is revalidated immediately before a scheduled fetch. Redirects are not followed; 3xx responses are recorded as failed checks. The response body is cancelled and not read.

The allowlist is defense in depth, not a complete DNS-rebinding defense. A hostname can resolve to a private address after application-level validation, and the standard Worker fetch API does not expose a verified public-IP pin for the connection. A reviewed egress proxy or network control that resolves and pins globally routable addresses remains a security release gate. Until that exists, keep Access restricted to trusted operators and do not allow untrusted public users to register arbitrary targets.

## D1 setup

Requirements: Node.js 20+, npm, a Cloudflare account, and Wrangler 4.

From this directory:

~~~bash
npm install
npx wrangler login
npm run db:create
~~~

Confirm the returned D1 database ID belongs to the intended account before committing it to `worker/wrangler.toml`. Do not overwrite an existing production database ID without verifying its ownership.

Apply migrations:

~~~bash
npm run db:migrate:local
npm run db:migrate:remote
~~~

## Local development

Create `.dev.vars` from `.dev.vars.example` and set a random `APIMON_API_TOKEN` of at least 32 characters. Apply the local D1 migration.

~~~bash
npm test
npm run dev
~~~

The Worker package scripts explicitly select `worker/wrangler.toml`. This is important because the repository root also contains a separate `wrangler.jsonc` for frontend assets. The local allowed origin defaults to `http://127.0.0.1:5173`; change it only to the exact origin used for direct browser-to-Worker requests. Local dashboard requests use the same-origin Vite proxy instead, which removes the browser Origin header and adds the service token server-side.

For the frontend, copy `frontend/.env.example` to `frontend/.env.local`. Put the same local token in `APIMON_API_TOKEN` and set `APIMON_API_ORIGIN` to `http://127.0.0.1:8787`. The token is injected by the Vite server proxy and never enters browser code.

## Production deployment

The GitHub Actions workflow deploys on pushes to `main` after Worker tests, frontend tests, and the frontend production build pass. Configure the required repository secrets and variables in `docs/DEPLOYMENT.md`. The workflow applies remote D1 migrations, writes the Worker secrets, deploys the Worker, builds the dashboard with the public API origin, and publishes Pages assets.

Cloudflare Access policies, DNS/custom domains, and the Pages project must be configured separately. After deployment:

1. Confirm `GET /health` returns HTTP 200.
2. Confirm `GET /ready` returns HTTP 200 and `status: "ready"`.
3. Verify the remote D1 migrations are applied.
4. Sign in through Cloudflare Access and confirm an allowlisted identity can use monitor endpoints.
5. Confirm unauthenticated and unlisted identities cannot access protected management operations.
6. Confirm only the configured dashboard Origin receives CORS permission.
7. Create the RetailOS monitor at `https://retailos-server.onrender.com/health` with a 10-minute interval, 10-second timeout, and expected HTTP 200.
8. Verify the monitor and check history persist in D1.
9. Turn off the dashboard device for at least 30 minutes and verify at least three scheduled check results after reopening APIMON.

Do not set `APIMON_API_TOKEN` as a public Wrangler variable or frontend build variable.

## Result shape

Each check result stores id, monitor_id, status (UP/DOWN), nullable http_status_code, nullable response_time_ms, UTC checked_at, and nullable sanitized error_category / error_message.

## Boundaries

- The Worker API currently manages one shared operator workspace. It does not implement end-user accounts or per-monitor ownership.
- D1 stores monitor configuration and history. The dashboard displays persisted check results only; it does not trigger scheduled checks when refreshed.
- Account ownership, PostgreSQL synchronization, incident processing, and retention cleanup remain outside this phase.

## Tests

~~~bash
npm test
~~~
