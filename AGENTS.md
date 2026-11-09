# APIMON Agent and Contributor Instructions

## Before changing anything

1. Read this file completely.
2. Read the relevant sections of `docs/PRD.md`, `docs/ARCHITECTURE.md`, and `docs/API.md`.
3. Inspect the existing implementation and tests before proposing or changing behavior.
4. Do not assume a feature, endpoint, database table, environment variable, or deployment exists unless it is present in the repository or explicitly documented.

## Product identity

- Product name: **APIMON**.
- Use APIMON consistently in user-facing product copy, documentation, page titles, and application metadata.
- Repository name remains `uptime-monitor`.
- Do not invent a logo asset or claim a trademark has been registered.

## Engineering workflow

- Work on a focused feature branch; do not commit feature work directly to `main`.
- Keep changes scoped to the requested task.
- Prefer small, reviewable commits and pull requests.
- Do not introduce dependencies without explaining why they are needed.
- Do not add speculative abstractions or build future phases prematurely.
- Preserve existing behavior unless the task explicitly changes it.
- Update documentation and tests with implementation changes.

## Testing

- Identify the prescribed test command for the component before making changes.
- Add or update tests for changed behavior.
- Run relevant tests, formatting, linting, and type checks where configured.
- Report exactly what ran and whether it passed. Never claim tests passed if they were not run.
- For every implementation phase, provide clear manual verification steps.

## Security requirements

- Treat every submitted target URL as untrusted input.
- Prevent SSRF, including loopback, private, link-local, reserved IP ranges, unsafe DNS resolutions, and redirect-based bypasses.
- Restrict schemes to HTTP and HTTPS.
- Apply request timeouts, response-size limits, concurrency limits, and rate limits.
- Never forward arbitrary user-supplied headers, credentials, methods, or request bodies from the monitoring engine.
- Keep secrets in server-side secret storage or environment bindings; never commit secrets.
- Protect account, monitor, and administrative operations with server-side authorization.
- Avoid leaking internal network addresses or stack traces in API responses.

## Monitoring correctness

- Scheduled checks must execute independently of the monitored service and independently of a user's browser or device.
- Persist check timestamps in UTC.
- Measure response time in milliseconds.
- Treat only the configured expected HTTP status as success; default is HTTP 200.
- Distinguish a failed check from an unexecuted or delayed check.
- Avoid claiming that monitoring checks guarantee uptime or prevent hosting-provider sleep/restarts.
- Make retries and incident state transitions explicit and testable.

## Documentation and product decisions

- Keep `docs/PRD.md`, `docs/ARCHITECTURE.md`, and `docs/API.md` synchronized.
- Record significant architecture changes and their trade-offs.
- Clearly label proposed behavior versus implemented behavior.
- Do not silently change product requirements.
