# APIMON Frontend

React + Vite dashboard connected to the Cloudflare Worker API.

## Local development

1. Start the Worker locally from the worker directory. Follow the D1 migration steps in worker/README.md.
2. Copy worker/.dev.vars.example to worker/.dev.vars and set a local APIMON_API_TOKEN of at least 32 characters.
3. Copy frontend/.env.example to frontend/.env.local.
4. Put the same local token in frontend/.env.local as APIMON_API_TOKEN. Set APIMON_API_ORIGIN to http://127.0.0.1:8787.
5. Run npm install and npm run dev from this directory.

In development, the dashboard always requests `/api` from the Vite origin. The Vite development server proxies these requests to `APIMON_API_ORIGIN` and adds the service token on the server side. Do not set `VITE_APIMON_API_BASE_URL` for local development; it is only used by production builds. The token is not bundled into browser JavaScript or stored in browser storage.

Vite's environment-variable precedence applies: an `APIMON_API_TOKEN` inherited from the shell or operating system overrides the value in `.env.local`. If the local proxy returns 401, ensure the inherited value matches `worker/.dev.vars` or unset the conflicting value before starting Vite.

## Production configuration

Set VITE_APIMON_API_BASE_URL to the public API hostname protected by Cloudflare Access. This value is a URL, not a secret.

Protect the Worker API hostname and /api/* routes with a Cloudflare Access application. Restrict the Access policy to the intended operators. Also set these Worker secrets:

- APIMON_ALLOWED_EMAILS: comma-separated, exact email allowlist for dashboard access.
- APIMON_ALLOWED_ORIGIN: the exact deployed dashboard origin, including scheme and port when applicable.

The Worker checks the signed-in identity supplied through the Cloudflare Workers Access context and independently checks the email allowlist. Browser requests use Access credentials; they never send APIMON_API_TOKEN.

Cloudflare Access must allow the browser's OPTIONS preflight requests to reach the Worker. The Worker permits preflight only for APIMON_ALLOWED_ORIGIN and returns no monitor data for those requests.

## Dashboard behavior

- Create, list, edit, pause, resume, and delete monitors through the Worker API.
- Display latest persisted check status, last-check time, and response time.
- View the latest 50 persisted check results for a selected monitor.
- Draw the response-time line chart only from recorded responseTimeMs values.
- Refresh monitor and history data on page load, manually, and every 60 seconds.
- Display loading, empty, validation, authentication, network, and API error states.
- Keep the last successfully loaded data visible when a refresh fails.
- Never imply that refreshing the dashboard triggers a scheduled check.

The Worker currently provides one Access-protected workspace, not per-user monitor ownership or a public multi-tenant account system.
