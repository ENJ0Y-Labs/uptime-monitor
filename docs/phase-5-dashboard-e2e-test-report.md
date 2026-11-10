# Phase 5 APIMON Dashboard E2E Test Report

**Generated:** 2026-11-10T17:04:34Z
**Target:** Issue #6, implementation PR #11
**Overall:** PARTIALLY VERIFIED — local UI-to-Worker-to-D1 flows and a simulated scheduler event were exercised. Wall-clock Cron execution, Cloudflare Access, production D1, and a successful RetailOS endpoint response remain unverified.

## Test environment

| Item | Observed |
|---|---|
| Environment | Local development only; no staging or production run |
| Test window | Approximately 2026-11-10T16:47Z–17:02Z |
| Browser | VS Code embedded browser, Chrome 150.0.7871.250, Windows 10 x64 |
| Frontend | `http://127.0.0.1:5173/` |
| Worker API | `http://127.0.0.1:8787` |
| Browser API path | Same-origin `/api/...` through the Vite development proxy |
| Database | Local Wrangler D1 database `apimon-db` |
| Authentication | Local Vite proxy bearer token from local development configuration; token was not recorded or exposed in browser requests |
| Cloudflare Access | Not emulated or verified locally |
| CORS | Same-origin browser requests used the Vite proxy. Exact-origin preflight and untrusted-origin rejection were verified in the prior local connectivity check; production CORS remains unverified. |
| Docker / Node | Docker CLI unavailable; Node.js v26.13.0. Wrangler local D1 and the running browser were used. |
| RetailOS test URL | `https://retailos-server.onrender.com/health` |

The local D1 database contained no monitors before this run. The dedicated `RetailOS E2E Test` monitor was created in the dashboard and deleted through the dashboard after testing. Final D1 queries confirmed that both that monitor and its check history were absent. No other monitors or production data were changed.

## Summary

- **PASS:** 7
- **PARTIAL:** 1
- **FAIL:** 0
- **BLOCKED / NOT RUN:** 0 complete test cases
- **Overall:** PARTIALLY VERIFIED. Local dashboard integration works against local Worker/D1, but automatic wall-clock scheduling and deployed authentication/persistence are not certified.

## Test results

| Test | Status | Evidence / Notes |
|---|---|---|
| Create RetailOS monitor | PASS | Created through the UI. The UI showed “Monitor created.” The browser observed `POST /api/monitors` HTTP 201 and a subsequent `GET /api/monitors` HTTP 200. Only one monitor was created after reload and repeated dashboard interactions. |
| Persistence after reload | PASS | Reloaded the dashboard; the monitor’s name, URL, 1-minute interval, timeout, and expected status were retrieved from the Worker API. D1 contained the matching monitor row and `created_at`; browser local storage/mock data was not used. |
| Scheduled checks | PARTIAL | The Worker warns that local development does not run Cron automatically. The documented Wrangler local scheduled-event endpoint was invoked twice and returned HTTP 200. It produced two genuine outbound check executions and persisted D1 records. This verifies the scheduled-handler path, **not** automatic wall-clock Cron execution. Both checks failed to connect to the external RetailOS host: `DOWN`, no HTTP status, response times 665 ms and 108 ms. |
| Pause and resume | PASS | Paused in the UI and reloaded; the API-backed dashboard showed `Paused`. A simulated scheduled event while paused left the D1 check count at 0. Resumed in the UI and reloaded; the monitor returned to active/unknown until another check. |
| Delete monitor | PASS | Deleted only the dedicated test monitor through the UI. After reload, the dashboard showed 0 monitors. D1 queries confirmed 0 matching monitor rows and 0 matching check rows (history cascade). Browser instrumentation also recorded a `DELETE` request as `net::ERR_ABORTED` without an HTTP status during confirmation; the persisted deletion and post-reload state were independently verified in D1 and the UI. |
| History and line chart | PASS | The API history response matched D1 for both check IDs, timestamps, status, HTTP status, and response-time values. The UI showed the same two records in chronological order, 665 ms then 108 ms, with a two-point line chart using the recorded timestamps and values. The latest status, timestamp, and latency matched the stored latest record. |
| Empty history | PASS | Before any check was recorded, the history API returned 0 records. The UI displayed “No checks have been recorded for this monitor yet” and “No response-time data yet”; no chart points or fabricated values appeared. |
| Worker API unavailable | PASS | Stopped the local Worker while successful monitor/history data was loaded. The dashboard displayed `API request failed` with a retry control and retained the monitor row and previous results. The history modal also showed an API error while keeping the previously loaded chart/history visible. Restarting the Worker restored API health and the dashboard recovered; retrying history succeeded. |

## Persisted data evidence

The monitor was created through the browser UI with ID `00d6dbfe-8eed-49e0-b881-a5a00b6287bc`. The local D1 row confirmed the test name, target URL, active state, configured interval/timeout/status, and creation timestamp. Editing the timeout through the UI from 10 to 15 seconds updated the dashboard and persisted configuration; the monitor was subsequently paused and resumed through the UI.

Two simulated local scheduled events created these persisted records:

| Check ID | Status | HTTP status | `responseTimeMs` | `checkedAt` (UTC) | Result detail |
|---|---|---:|---:|---|---|
| `f92f305d-7c4b-41a6-a0b9-ac0d6fb763c2` | DOWN | null | 665 | 2026-11-10T16:55:00.487Z | Could not connect to the target service. |
| `bcc8b8f0-f5af-4a5e-b862-74a9ffce1dd3` | DOWN | null | 108 | 2026-11-10T16:56:56.159Z | Could not connect to the target service. |

For the first record, the API response and D1 row matched exactly on ID, monitor ID, status, HTTP status, response time, and timestamp. The dashboard showed that record and its 665 ms value. After the second event, the dashboard refreshed to two records and drew a line through the two persisted values. The RetailOS endpoint was therefore not healthy in this environment; the DOWN results are real checks, not a successful-target verification.

## Browser and network evidence

- Successful dashboard creation request: `POST /api/monitors` → HTTP 201.
- Monitor reload and history requests: `GET /api/monitors` and `GET /api/monitors/{id}/checks?limit=50` → HTTP 200.
- Controlled Worker outage: the Vite proxy returned HTTP 500 to dashboard requests; the browser console recorded the expected failed-resource error. The dashboard remained usable and retained previously loaded data.
- Worker health after recovery: `GET /health` → HTTP 200.
- Local scheduled-event endpoint: `GET /cdn-cgi/local/scheduled` → HTTP 200 for each invocation.
- Browser instrumentation recorded the deletion request as `net::ERR_ABORTED` with no HTTP status; D1 and reload independently confirmed the resulting deletion.
- No uncaught frontend exception was observed. No credential, cookie, or service-token value was included in evidence.
- Screenshots of the empty-history state and the two-record history/chart were captured in the accompanying chat. The chart screenshot shows both actual persisted response-time points and their chronological ordering.

## Automated verification

| Command | Result |
|---|---|
| `Set-Location frontend; npm test` | PASS — 20/20 tests |
| `Set-Location worker; npm test` | PASS — 22/22 tests |
| `Set-Location frontend; npm run build` | PASS |
| `git diff --check` | PASS |

The frontend regression tests cover API route construction, browser credential handling, response validation, history snapshot failures, timestamp-scaled chart transformation, chronological order, and empty/malformed chart data. The Worker suite covers authentication, exact-origin CORS, D1-backed monitoring behavior, scheduled-check behavior, and error handling. These automated tests complement—but do not replace—the local browser/D1 run above.

An initial attempt to run `npm test` and `npm run build` from the repository root failed because there is no root `package.json`; the commands were rerun from their respective package directories and passed.

## Reproduction and local startup

From the repository root, start the Worker and frontend in separate PowerShell terminals:

```powershell
Set-Location worker
npm run dev -- --port 8787
```

```powershell
# Ensure this process receives the same local APIMON_API_TOKEN configured for the Worker.
# Do not put that value in browser-visible Vite variables or commit it.
Set-Location frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

If an inherited `APIMON_API_TOKEN` differs from the Worker’s local token, the Vite proxy will receive 401 responses; set the frontend process environment to the matching local value without printing it. Local scheduled events are not automatic. Use the supported local Wrangler scheduled-event mechanism documented by the Worker when testing the scheduler, and label that result as simulated.

## Findings and outstanding verification

1. **RetailOS target reachability:** Both local scheduled checks failed with a connection error. A previous direct probe also timed out. The dashboard accurately displayed persisted DOWN results; a successful RetailOS check is unverified.
2. **Automatic schedule cadence:** Local Wrangler does not execute Cron automatically during development. The scheduled handler was exercised via its local test endpoint, but real wall-clock scheduling was not verified.
3. **Production environment:** Cloudflare Access policy, production D1 connectivity, production CORS, deployed Worker behavior, and production scheduled execution were not tested.
4. **Deletion instrumentation:** Browser instrumentation reported the DELETE request as aborted without a status, although D1 confirmed that the monitor and its history were deleted and a subsequent API-backed dashboard reload showed no monitor. Preserve this detail when interpreting the UI operation.
5. **Issue #6 update:** The requested checkbox-by-checkbox update could not be submitted because `gh auth status` reports that the GitHub CLI is not logged in and no issue-body edit tool is available in this session. Issue #6 was not closed or modified; its existing unchecked acceptance and E2E-test items remain unchanged.

## Production-verification readiness

**Not ready for production verification.** The local UI → Worker API → D1 → simulated scheduled handler → D1 history → Worker API → UI flow was verified. Repeat against a designated staging environment after verifying Cloudflare Access, the production D1 binding/migrations, exact-origin production CORS, deployed Cron execution, and a reachable approved RetailOS test endpoint. Do not infer production readiness from this local run.
