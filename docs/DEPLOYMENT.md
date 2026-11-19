# APIMON production deployment runbook

This runbook deploys the static dashboard to Cloudflare Pages and the scheduled monitoring engine/API to Cloudflare Workers with D1. Repeatable deployment is automated in GitHub Actions; Cloudflare account security settings remain an explicit one-time setup.

## Production architecture and schedule

- Dashboard: Cloudflare Pages, built from `frontend/` with output directory `dist`.
- API and scheduler: Worker `apimon-monitor-worker`, configured by `worker/wrangler.toml`.
- Persistent monitor configuration and results: D1 database `apimon-db`, bound as `APIMON_DB`.
- Worker readiness: `GET /health` checks process liveness; `GET /ready` verifies that the D1 binding and `monitors` schema are available.
- Cron Trigger: `* * * * *` (poll due monitors every minute, UTC). Each monitor's own interval controls when it is due. RetailOS is configured for 10 minutes with a 10-second timeout. Do not change the Worker Cron to every 10 minutes: that would break the supported 1- and 5-minute intervals.

## One-time Cloudflare setup

1. Create or select the intended Cloudflare account and confirm that the D1 database ID in `worker/wrangler.toml` belongs to that account. The repository contains a configured ID, but it must be verified in the account before any production migration.
2. Create the Cloudflare Pages project. Use the exact project name in the GitHub repository variable `CLOUDFLARE_PAGES_PROJECT_NAME`.
3. Deploy the Worker once through the GitHub workflow after configuring its secrets and variables. The Worker name is `apimon-monitor-worker`.
4. Assign a dedicated HTTPS hostname to the Worker and a separate HTTPS hostname to Pages. The dashboard hostname must exactly match `APIMON_ALLOWED_ORIGIN`; the API hostname must exactly match the origin in `APIMON_API_BASE_URL`.
5. Do not create a Cloudflare Access application for the Worker API hostname. Remove any existing Access application or policy that intercepts requests to this hostname; the Worker must receive requests directly so it can validate the Authorization bearer token.
6. Configure the Pages custom domain and DNS. Confirm the deployed dashboard is served over HTTPS.

## GitHub Actions configuration

Add these repository secrets:

- `CLOUDFLARE_API_TOKEN`: scoped to the intended account, with Workers Scripts edit, D1 edit, and Cloudflare Pages edit permissions.
- `APIMON_API_TOKEN`: a random bearer token of at least 32 characters. The dashboard operator enters this token in the connection screen; it is not included in the frontend build.

Add these repository variables:

- `CLOUDFLARE_ACCOUNT_ID`: target Cloudflare account ID.
- `CLOUDFLARE_PAGES_PROJECT_NAME`: existing Pages project name.
- `APIMON_API_BASE_URL`: HTTPS Worker API origin, without a path or trailing slash.
- `APIMON_ALLOWED_ORIGIN`: exact HTTPS Pages dashboard origin, without a path or trailing slash.

The deploy workflow first runs Worker tests, frontend tests, and the frontend production build. It then validates required settings, applies remote D1 migrations, writes the Worker secrets, deploys the Worker, builds the dashboard with the public API origin, and publishes the Pages assets. The service token and allowed origin are written as Worker secrets. The browser receives only the public API origin through `VITE_APIMON_API_BASE_URL`.

The workflow does not create or remove Access applications/policies, custom domains, DNS records, or the Pages project. Ensure the Worker API hostname is not protected by Cloudflare Access, then complete custom-domain and Pages setup manually.

## Manual deployment

From the repository root, after setting `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the shell:

```bash
cd worker
npm ci
npm run db:migrate:remote
printf '%s' "$APIMON_API_TOKEN" | npx wrangler secret put APIMON_API_TOKEN --config wrangler.toml
printf '%s' "$APIMON_ALLOWED_ORIGIN" | npx wrangler secret put APIMON_ALLOWED_ORIGIN --config wrangler.toml
npm run deploy

cd ../frontend
npm ci
VITE_APIMON_API_BASE_URL=https://YOUR-WORKER-HOST npm run build
npx wrangler@4 pages deploy dist --project-name YOUR-PAGES-PROJECT --branch main
```

Never put `APIMON_API_TOKEN` in a `VITE_*` variable, frontend environment file, browser storage, or static asset.

## Production verification checklist

1. Open `GET /health` on the deployed Worker and confirm HTTP 200.
2. Open `GET /ready` and confirm HTTP 200 with `status: "ready"`; this verifies the D1 binding and required schema.
3. Confirm the remote D1 migration list shows all repository migrations as applied.
4. Open the Pages custom domain and confirm the dashboard loads.
5. Inspect the built JavaScript assets and confirm neither `APIMON_API_TOKEN` nor any other server secret is present.
6. Confirm the dashboard calls the configured HTTPS Worker API origin.
7. Send a request to `/api/monitors` without an Authorization header; it must return HTTP 401 from the Worker.
8. Enter the exact `APIMON_API_TOKEN` value in the dashboard connection screen; monitor API access must succeed.
9. Test an incorrect token; it must return HTTP 401. Confirm the correct token is not present in built JavaScript assets or browser storage.
10. Verify that the exact dashboard origin receives the configured CORS response, an untrusted Origin receives 403, and preflight returns an empty 204.
11. Create the RetailOS monitor using the Phase 1 health URL: `https://retailos-server.onrender.com/health`. Confirm interval is 10 minutes, timeout is 10 seconds, and expected status is HTTP 200.
12. Confirm the monitor is stored in production D1 and survives a dashboard reload.
13. Confirm Worker Cron Events show invocations and structured Worker logs show scheduler execution and persistence outcomes.
14. Close the browser and turn off the laptop. Wait at least 30 minutes, allowing for scheduler execution delays.
15. Reopen APIMON and verify at least three persisted results for RetailOS, with UTC timestamps, status, and response time where measurable.
16. Confirm the timestamps span the offline period. A dashboard refresh must not be what triggered those scheduled checks.

## Target validation and SSRF release gate

The Worker rejects non-HTTP(S) schemes, URL credentials, IP-literal hosts, localhost and local/reserved hostname suffixes, non-standard ports, fragments, and hostnames that are not in the explicit `APIMON_ALLOWED_TARGET_HOSTS` allowlist. The current production allowlist contains only `retailos-server.onrender.com`. Add another hostname only through a reviewed repository change.

The Worker revalidates the stored monitor immediately before each outbound request. Fetch uses `redirect: "manual"`; redirect responses are recorded as failures and are never followed. Response bodies are cancelled without being read. Logs do not include the full target URL, response body, or secret values.

**Important limitation:** a hostname allowlist and application-level URL validation do not prove that the hostname resolves to public IP addresses at connection time. They do not completely prevent DNS rebinding or DNS compromise. Cloudflare Workers' standard outbound `fetch()` path does not provide this application with a verified public-IP pin that can be bound to the subsequent connection. A reviewed egress proxy/network control that resolves and pins only globally routable addresses is still required before APIMON can claim complete DNS-rebinding-resistant SSRF protection or accept arbitrary/untrusted monitor registrations. Until that control is deployed and tested, keep the API bearer token restricted to trusted operators and keep the explicit hostname allowlist narrow. This remains a production security release gate.

## Rollback

- Pages: redeploy the previous successful Pages deployment from the Cloudflare dashboard.
- Worker: deploy the previous known-good commit with the same `worker/wrangler.toml` configuration.
- D1: do not roll back migrations by deleting production data. Verify a D1 backup before schema changes and prefer a reviewed forward-fix migration.
- After rollback, verify `/health`, `/ready`, Access, CORS, dashboard API access, and scheduler logs.
