# APIMON Cloudflare Worker

Phase 3 scheduled monitoring engine.

## What it does

- Runs independently through a Cloudflare Cron Trigger every 10 minutes.
- Loads a temporary JSON monitor configuration from the `APIMON_MONITORS` Worker binding.
- Sends HTTP GET requests with a maximum 10-second timeout.
- Treats the configured expected status (default HTTP 200) as success.
- Records response time in milliseconds and UTC timestamps.
- Records unexpected statuses, timeouts, and connection failures as DOWN.
- Prevents one target failure from stopping the remaining checks.
- Emits one structured JSON log event per result.
- Exposes `GET /health` for the Worker service itself.

## Important Phase 3 limitation

The temporary `APIMON_MONITORS` binding is an operator-managed JSON configuration, not a database. It does not read the frontend's browser local storage and it is not updated when a user adds a monitor in the frontend. Check results are emitted to Worker logs only and are not durable. Phase 4 must replace this temporary configuration/logging path with durable monitor and check-result storage.

The Phase 3 schedule is every 10 minutes. To keep scheduling behavior honest and aligned with this Cron Trigger, the temporary worker configuration currently accepts only a 10-minute monitor interval. Other intervals require a different due-monitor scheduler strategy.

## Local setup

Requirements: Node.js 20+ and npm.

```bash
cd worker
npm install
npm test
npm run dev
```

The local Worker health endpoint is available at `http://localhost:8787/health`. A local scheduled event can be triggered with Wrangler's scheduled-event command:

```bash
npx wrangler dev --test-scheduled
```

Then open `http://localhost:8787/__scheduled` in another terminal/browser request to trigger the local scheduled handler.

## Configure production

1. Create a Cloudflare account and authenticate Wrangler: `npx wrangler login`.
2. Review `wrangler.toml` and confirm the monitor URL is an endpoint you own or are authorized to check.
3. Set `APIMON_MONITORS` as a Worker variable in the Cloudflare dashboard, using the JSON array format shown in `wrangler.toml`.
4. Deploy from this directory with `npm run deploy`.
5. Confirm the Worker has the `*/10 * * * *` Cron Trigger.
6. Inspect Worker invocation logs after a scheduled run and verify the structured result for each target.

Do not commit credentials or secrets. The current RetailOS URL is public and contains no credential, but only use it with permission.

## Result shape

Each scheduled attempt emits a structured object with:

- `monitorId`, `monitorName`
- `status`: `UP` or `DOWN`
- `httpStatusCode`: integer or null
- `responseTimeMs`: integer
- `checkedAt`: ISO 8601 UTC
- `errorCategory`, `errorMessage`: null on success; sanitized on failure

## Security boundary

The Worker rejects localhost, common private IPv4 ranges, IPv6 literal hosts, URL credentials, non-HTTP(S) schemes, non-standard ports, and fragments. Redirects are not followed. This reduces obvious SSRF paths but is not a complete defense against DNS rebinding or all provider-specific network routing behavior. The current configuration is operator-controlled, not user-submitted. Do not expose monitor creation to untrusted users until the full SSRF controls and authenticated service integration are implemented and reviewed.

## Tests

```bash
npm test
```
