# APIMON Cloudflare Worker

Phase 4 scheduled monitoring engine with Cloudflare D1 persistence.

## What it does

- Polls D1 every minute using a Cloudflare Cron Trigger.
- Selects only active monitors whose `next_check_at` is due.
- Supports monitor intervals of 1, 5, 10, 20, and 30 minutes.
- Sends bounded HTTP GET requests (1–30 second configured timeout).
- Treats only the configured expected HTTP status as UP.
- Persists each completed check result and updates the monitor's last-check timestamp.
- Stores timestamps as ISO 8601 UTC strings.
- Provides authenticated monitor CRUD, pause/resume, and check-history routes.
- Keeps `GET /health` public for service health checks.

## D1 setup

Requirements: Node.js 20+, npm, a Cloudflare account, and Wrangler 4.

From this directory:

```bash
npm install
npx wrangler login
npm run db:create
```

Copy the returned D1 database ID into `database_id` in `wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.

Apply the migration locally and remotely:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

The migration creates `monitors`, `check_results`, the foreign key, and indexes for due-monitor polling and recent history. The SQL uses `IF NOT EXISTS` for safe repeatability.

## Local development

Create `.dev.vars` from `.dev.vars.example` and set a random `APIMON_API_TOKEN` value of at least 32 characters. This file is ignored by Git.

```bash
npm test
npm run dev
```

Apply local migrations before testing the API. The local D1 database is separate from production.

Create a monitor:

```bash
curl -X POST http://localhost:8787/api/monitors \
  -H "Authorization: Bearer YOUR_LOCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example API","url":"https://example.com/health","intervalMinutes":5,"timeoutSeconds":10,"expectedStatus":200}'
```

List monitors:

```bash
curl http://localhost:8787/api/monitors -H "Authorization: Bearer YOUR_LOCAL_TOKEN"
```

Read recent history:

```bash
curl "http://localhost:8787/api/monitors/MONITOR_ID/checks?limit=50" \
  -H "Authorization: Bearer YOUR_LOCAL_TOKEN"
```

## API routes

All `/api/*` routes require `Authorization: Bearer <APIMON_API_TOKEN>`. The token is a service credential for trusted server-side clients only. Never put it in frontend JavaScript or browser storage.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/monitors` | List monitors |
| POST | `/api/monitors` | Create a monitor |
| GET | `/api/monitors/:id` | Retrieve a monitor |
| PATCH | `/api/monitors/:id` | Update monitor configuration |
| DELETE | `/api/monitors/:id` | Delete monitor and cascade its history |
| POST | `/api/monitors/:id/pause` | Pause scheduled checks |
| POST | `/api/monitors/:id/resume` | Resume scheduled checks immediately |
| GET | `/api/monitors/:id/checks?limit=50` | Read recent check history |

## Production deployment

1. Replace the D1 database ID placeholder in `wrangler.toml`.
2. Apply remote migrations: `npm run db:migrate:remote`.
3. Set a strong production token: `npx wrangler secret put APIMON_API_TOKEN`.
4. Deploy: `npm run deploy`.
5. Confirm the every-minute Cron Trigger.
6. Create a test monitor through the authenticated API.
7. Wait for its due time and verify a row appears in `check_results`.
8. Pause it and confirm later scheduled runs add no further rows.
9. Redeploy and confirm existing records remain in D1.

Do not set `APIMON_API_TOKEN` as a public `[vars]` value. Use Wrangler secrets.

## Result shape

Each check result stores `id`, `monitor_id`, `status` (UP/DOWN), nullable `http_status_code`, nullable `response_time_ms`, UTC `checked_at`, and nullable sanitized `error_category` / `error_message`.

## Boundaries and security

- The Worker API uses one shared service token, not end-user accounts or per-monitor ownership. Keep it behind trusted server-side integration.
- URL validation blocks common private IPv4 ranges, localhost, IPv6 literal hosts, credentials, non-HTTP(S) schemes, non-standard ports, and fragments. Redirects are not followed. DNS rebinding and all provider-specific egress paths are not fully mitigated. Do not expose this API directly to untrusted users before a dedicated SSRF review.
- D1 is durable storage for Worker monitor configuration and history. The React prototype still uses browser local storage and is not connected to this API.
- Account ownership, frontend integration, incident processing, retention cleanup, and PostgreSQL synchronization are outside this issue.

## Tests

```bash
npm test
```

Node tests cover validation, response classification, timeouts, and API authentication. Use the local D1 migration and manual API steps to verify D1 CRUD, foreign-key cascade, scheduled polling, and persistence.
