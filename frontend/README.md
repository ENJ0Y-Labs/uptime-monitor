# APIMON Frontend

Low-fidelity React + Vite interface prototype.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Current prototype behavior

- Responsive overview dashboard.
- Demo monitor list and summary cards.
- Add monitor modal with basic HTTP/HTTPS URL validation.
- Search and status filters.
- Pause/resume and remove monitor actions.
- Browser-local persistence using localStorage.
- Illustrative response-time chart and activity feed.

## Important limitations

This is a frontend-only prototype. It does not send real monitoring requests, execute scheduled checks, authenticate users, or connect to a backend or worker. Demo data is stored in the current browser only. Chart values and sample incidents are illustrative.
