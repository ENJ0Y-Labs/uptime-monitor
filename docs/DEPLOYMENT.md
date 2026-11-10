# APIMON production deployment runbook

This runbook deploys the static dashboard to Cloudflare Pages and the scheduled monitoring engine/API to Cloudflare Workers with D1. It deliberately separates repeatable deployment automation from one-time account security configuration.

## Architecture and schedule decision

- Dashboard: Cloudflare Pages, built from `frontend/` with output directory `dist`.
- API and scheduler: Cloudflare Worker configured by `worker/wrangler.toml`.
- Persistent monitor configuration and results: the D1 database bound as `APIMON_DB`.
- Scheduler trigger: `* * * * *` (once per minute). The Worker polls D1 and only claims monitors whose `next_check_at` is due. This is intentional: a ten-minute Cron Trigger would break the already-supported 1- and 5-minute monitor intervals. Configure the RetailOS monitor itself to a 10-minute interval. Do not confuse the polling frequency with the target's check interval.

## One-time Cloudflare setup

1. Create or select the Cloudflare account and authenticate with Wrangler: `npx wrangler login`.
2. Create the D1 database using `npm run db:create` from `worker/`, or use the existing production database. Verify that the database ID in `worker/wrangler.toml` belongs to the intended production account. Never create a second database merely to silence a binding error.
3. Create a Cloudflare Pages project for APIMON. Connect the repository only if using Pages Git integration; otherwise the deployment workflow publishes the built assets.
4. Assign a production API hostname to the Worker and a separate dashboard hostname to Pages. Use HTTPS for both.
5. Create a Cloudflare Access self-hosted application protecting the Worker API hostname and `/api/*`. Restrict the policy to the intended operator identities. Ensure OPTIONS preflight requests can reach the Worker without an Access login redirect.
6. Configure the Worker secrets in the Cloudflare dashboard or with Wrangler:
   - `APIMON_API_TOKEN`: strong random server-to-server token, at least 32 characters.
   - `APIMON_ALLOWED_EMAILS`: exact comma-separated operator email allowlist.
   - `APIMON_ALLOWED_ORIGIN`: exact dashboard origin, for example `https://apimon.example.com`.
7. Configure the Worker custom domain/route and confirm the Access application covers the actual API hostname.
8. Configure the dashboard DNS/custom domain in Cloudflare Pages.

## GitHub Actions configuration

Add these repository secrets:

- `CLOUDFLARE_API_TOKEN`: scoped API token with Workers Scripts edit, D1 edit, and Cloudflare Pages edit permissions for the target account.

Add this repository variable:

- `CLOUDFLARE_ACCOUNT_ID`: target Cloudflare account ID.

Add these repository variables for Pages deployment:

- `CLOUDFLARE_PAGES_PROJECT_NAME`: existing Pages project name.
- `APIMON_API_BASE_URL`: public HTTPS Worker API origin, with no trailing slash.

The workflow deploys the Worker, applies remote D1 migrations, builds the dashboard with the public API URL, and publishes the Pages assets. It does not create Cloudflare Access policies, DNS records, custom domains, D1 databases, or Worker secrets. Those are one-time account-level settings and must be completed separately.

## Manual deployment

From the repository root:

```bash
cd worker
npm ci
npm run db:migrate:remote
npm run deploy
cd ../frontend
npm ci
VITE_APIMON_API_BASE_URL=https://YOUR-WORKER-HOST npm run build
npx wrangler@4 pages deploy dist --project-name YOUR-PAGES-PROJECT --branch main
```

Set the Cloudflare credentials in the environment before running Wrangler. Do not put `APIMON_API_TOKEN` in a `VITE_*` variable or in frontend build configuration.

## Production verification checklist

Do not mark deployment complete until each item has been verified against the real production account:

1. Verify the Worker deployment and `GET /health` returns HTTP 200.
2. Verify the D1 binding points to the intended production database and all remote migrations are applied.
3. Verify the dashboard loads from the Pages custom domain and calls the configured Worker API origin.
4. Verify an unauthenticated request to `/api/monitors` is rejected.
5. Sign in through Cloudflare Access with an allowlisted identity and verify monitor API access.
6. Verify an unlisted identity is denied.
7. Verify the exact dashboard origin succeeds and an untrusted Origin is rejected. Verify OPTIONS preflight reaches the Worker without an Access redirect.
8. Create the RetailOS monitor through the dashboard using the verified Phase 1 health URL. Confirm interval is 10 minutes and timeout is 10 seconds.
9. Confirm the monitor is present in production D1 and survives a dashboard reload.
10. Close the browser and turn off the laptop. Wait at least 30 minutes, allowing for scheduler delays.
11. Reopen the dashboard and verify at least three persisted check results, including UTC timestamps, status, and response times where measurable.
12. Verify pause/resume/delete from the UI and confirm the corresponding production D1 state.
13. Inspect Worker logs for scheduler execution and persistence errors. Do not treat a successful `/health` response as proof that scheduled checks are running.

## Security release gate

The current URL validator rejects common private IPv4 ranges, localhost, IPv6 literals, credentials, non-HTTP(S) schemes, non-standard ports, and fragments. Redirects are not followed. The Worker now revalidates the persisted monitor configuration immediately before every outbound fetch.

This does **not** fully prevent DNS rebinding or guarantee that a hostname resolves only to public addresses at connection time. Do not open monitor creation to untrusted public users or claim complete SSRF protection until DNS resolution/egress controls are reviewed and verified. Cloudflare Access limits the current shared workspace to trusted operators, but Access is not a substitute for SSRF defenses.

## Rollback

- Pages: redeploy the previous successful Pages deployment from the Cloudflare dashboard.
- Worker: deploy the previous known-good commit with the same `worker/wrangler.toml` configuration.
- D1: do not roll back migrations by deleting production data. Take/verify a D1 backup before schema changes and use a forward-fix migration unless a reviewed restore procedure is required.
- After rollback, verify `/health`, Access, CORS, dashboard API access, and scheduler logs.
