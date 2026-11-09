# APIMON Frontend

React + Vite monitor-configuration interface for the APIMON MVP.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

## Run validation tests

From the repository root:

```bash
cd frontend
npm test
```

## Phase 2 functionality

- Add a monitor with a name and absolute HTTP/HTTPS URL.
- Configure a supported interval (5, 10, 20, or 30 minutes).
- Configure a supported timeout (5, 10, 15, or 30 seconds).
- Configure the expected HTTP status (100–599; default 200).
- List and search saved monitor configurations.
- Edit, pause, resume, and delete a monitor.
- Persist configuration in browser local storage for this frontend-only phase.
- Show new and unchecked monitors as **Unknown**, never as UP.

## Explicit limitations

This phase is configuration UI only. Browser local storage is temporary prototype persistence, not the future source of truth. The frontend does not send monitoring requests, schedule checks, verify target availability, calculate uptime, display real response times, or connect to the Worker/backend. Do not interpret an Active monitor as a healthy monitor. Live results will be implemented in later phases.


## Phase 4 integration boundary

The Cloudflare Worker now has a D1-backed monitor API, but this frontend has not been connected to it yet. Existing browser-local monitors are not automatically migrated or synchronized to D1. Do not put the Worker service token in frontend code. A future authenticated Flask API or another trusted server-side integration must mediate user access.
