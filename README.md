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

To run it locally:

```bash
cd frontend
npm install
npm run dev
```

Read [frontend/README.md](frontend/README.md) for the dashboard's local setup, Cloudflare Access configuration, and integration behavior.

1. Read [AGENTS.md](AGENTS.md) before making changes.
2. Read [docs/PRD.md](docs/PRD.md) for product scope.
3. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system boundaries.
4. Read [docs/API.md](docs/API.md) for the initial API contract.

## Development principles

- Build and verify one milestone at a time.
- Keep the scheduler independent from the monitored applications.
- Store timestamps in UTC.
- Validate and secure all user-supplied target URLs against SSRF.
- Never expose monitor credentials or secrets in frontend code or logs.
- Add tests and update documentation with every feature.
- Do not claim uptime guarantees based only on periodic HTTP checks.

## Project status

**Phase 5 dashboard integration implementation.** The dashboard now uses the Worker API for monitor CRUD, status, check history, and response-time charts. Production authentication uses Cloudflare Access, while the service token remains server-side. Production Access, CORS, D1, and scheduled-check verification are required before this phase can be called deployed and complete.
