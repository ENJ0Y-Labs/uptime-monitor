# APIMON

**APIMON** is a cloud-based uptime and API monitoring platform. Add a website or API URL, choose how frequently it should be checked, and APIMON performs checks automatically from its cloud infrastructure, records results, and presents availability and response-time history.

> Monitor your services. Know when they fail.

## Product goals

- Monitor websites and HTTP APIs from an independent cloud scheduler.
- Let users register a URL and configure its check interval and timeout.
- Record status, HTTP status code, response time, UTC timestamp, and failure details.
- Show current status, uptime history, response-time trends, and incidents.
- Notify users when monitored services fail and recover.
- Keep monitoring independent of the services being monitored and of the user's device.

## Repository layout

```text
frontend/   React + Vite web application
backend/    Flask REST API and application services
worker/     Cloudflare Worker scheduled monitoring engine
docs/       Product, architecture, and API documentation
tests/      Cross-component and integration test organization
```

## Initial technology direction

| Component | Technology |
|---|---|
| Web application | React + Vite |
| Application API | Python + Flask |
| Scheduled checks | Cloudflare Workers + Cron Triggers |
| Primary application database | PostgreSQL |
| Charts | Recharts |
| Initial notifications | Email |

These are initial architecture decisions and may be revised through documented technical decisions before implementation. The monitoring worker must not depend on the Flask API being available in order to execute already scheduled checks.

## Getting started

The APIMON dashboard is available in `frontend/`. It connects to the Cloudflare Worker API for monitor configuration and persisted check history. Production browser access is protected with Cloudflare Access; the local Vite proxy keeps the Worker service token server-side.

Before starting, read [AGENTS.md](AGENTS.md), [worker/README.md](worker/README.md), and [frontend/README.md](frontend/README.md).

For local development, start the Worker first, configure its local D1 database and service token, then configure the frontend's server-side Vite proxy:

~~~bash
cd worker
npm install
npm run db:migrate:local
npm run dev
~~~

In a second terminal, copy frontend/.env.example to frontend/.env.local, set APIMON_API_TOKEN to the same local token used by the Worker, then run:

~~~bash
cd frontend
npm install
npm run dev
~~~

Read [docs/PRD.md](docs/PRD.md) for product scope, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system boundaries, and [docs/API.md](docs/API.md) for the API contract.

## Development principles

- Build and verify one milestone at a time.
- Keep the scheduler independent from the monitored applications.
- Store timestamps in UTC.
- Validate and secure all user-supplied target URLs against SSRF.
- Never expose monitor credentials or secrets in frontend code or logs.
- Add tests and update documentation with every feature.
- Do not claim uptime guarantees based only on periodic HTTP checks.

## Project status

**Phase 6 production hardening is implemented in [PR #13](https://github.com/ENJ0Y-Labs/uptime-monitor/pull/13), but production deployment is not verified.** Local Worker and frontend checks pass, and the configured D1 database and applied migration were inspected without modifying production data. Deployment remains blocked by missing Cloudflare deployment credentials and Pages configuration, unverified production Access/CORS/Cron settings, an unresponsive candidate RetailOS health endpoint, and the documented DNS-rebinding limitation. See the [Phase 6 implementation report](./PHASE-6-IMPLEMENTATION-REPORT.md) for evidence and outstanding acceptance criteria.
