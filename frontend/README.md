# APIMON Frontend

React + Vite dashboard connected to the Cloudflare Worker API.

## Local development

1. Start the Worker locally from the worker directory. Follow the D1 migration steps in worker/README.md.
2. Copy worker/.dev.vars.example to worker/.dev.vars and set a random local APIMON_API_TOKEN of at least 32 characters.
3. Copy frontend/.env.example to frontend/.env.local. Set APIMON_API_ORIGIN to http://127.0.0.1:8787.
4. Run npm install and npm run dev from this directory.
5. Open the dashboard and enter the same token configured in worker/.dev.vars.

The Vite development proxy forwards the browser's Authorization header to the local Worker and removes the browser Origin header to avoid local CORS. The token is not read from a frontend environment variable, bundled into JavaScript, or saved to browser storage.

## Production configuration

Set VITE_APIMON_API_BASE_URL to the public HTTPS Worker API origin. This value is a URL, not a secret.

Set the Worker secrets and variables:

- APIMON_API_TOKEN: random bearer credential of at least 32 characters. The dashboard operator enters this value in the connection screen.
- APIMON_ALLOWED_ORIGIN: exact deployed dashboard origin, including scheme and port when applicable.

Do not protect the Worker API hostname with a Cloudflare Access application or policy. Cloudflare Access intercepts requests before they reach the Worker, so the Worker cannot validate the APIMON bearer token when that edge policy blocks the request. The Worker API now authenticates protected routes exclusively with Authorization: Bearer <APIMON_API_TOKEN>; APIMON_ALLOWED_EMAILS and Access identity context are no longer used.

The dashboard sends the token in the Authorization header and omits browser cookies. The token is held in JavaScript memory only and is cleared on page refresh or sign out. It is not stored in localStorage, sessionStorage, a VITE_ variable, or a static asset. Because it is a bearer credential, an operator with access to an authenticated browser session can inspect and copy it from browser developer tools. Share it only with trusted operators and rotate it if exposed.

APIMON_ALLOWED_ORIGIN is a browser-origin restriction, not authentication. The bearer token is the authentication mechanism. The API remains a single shared workspace; per-user accounts and monitor ownership are not implemented.

## Dashboard behavior

- Create, list, edit, pause, resume, and delete monitors through the Worker API.
- Display latest persisted check status, last-check time, and response time.
- View the latest 50 persisted check results for a selected monitor.
- Draw the response-time line chart only from recorded responseTimeMs values.
- Refresh monitor and history data on page load, manually, and every 60 seconds after token authentication.
- Display loading, empty, validation, authentication, network, and API error states.
- Keep the last successfully loaded data visible when a refresh fails.
- Never imply that refreshing the dashboard triggers a scheduled check.

The Worker currently provides one bearer-token-protected workspace, not per-user monitor ownership or a public multi-tenant account system.
