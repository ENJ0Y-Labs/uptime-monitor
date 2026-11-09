# APIMON Product Requirements Document

**Status:** Initial draft; frontend prototype available  
**Product:** APIMON  
**Repository:** `ENJ0Y-Labs/uptime-monitor`

## 1. Product overview

APIMON is a web-based uptime and API monitoring platform. A user registers a website or API URL, chooses how frequently it should be checked, and APIMON performs scheduled HTTP checks from cloud infrastructure. The product records results and presents service availability, response times, and incidents.

The monitoring engine must continue operating when the user's browser is closed, their computer is offline, or the monitored service is unavailable.

## 2. Problem

Developers and operators need a simple way to know whether their websites and APIs are responding. Manually opening URLs is unreliable, and a monitoring process hosted inside the service being monitored can fail at the same time as that service.

## 3. Goals

- Make it straightforward to create and manage URL monitors.
- Execute checks automatically according to each monitor's configured interval.
- Record reliable, timestamped check results.
- Show current service state, historical availability, latency, and incidents.
- Notify users about sustained downtime and recovery.
- Operate the checker independently from monitored targets.

## 4. Non-goals for the first release

- Full application performance monitoring or distributed tracing.
- Browser-based synthetic user journeys.
- Load testing or stress testing.
- Arbitrary user-defined scripts executed by workers.
- Native desktop and native mobile applications.
- Guaranteed prevention of hosting-provider sleep, restarts, or outages.

## 5. Target users

- Independent developers monitoring personal projects.
- Small teams responsible for websites and APIs.
- Businesses that need visibility into service availability.
- Operators managing multiple production endpoints.

## 6. Core user journey

1. User creates an APIMON account and signs in.
2. User adds a monitor with a display name and HTTP/HTTPS URL.
3. User chooses a check interval and timeout.
4. User selects the expected success status (HTTP 200 by default).
5. APIMON validates the target and saves the configuration.
6. The independent scheduler executes checks automatically.
7. APIMON stores each result and updates monitor status and incident state.
8. User views history and receives configured failure/recovery notifications.

## 7. Functional requirements

### 7.1 Monitor management

Users must be able to:
- Create a monitor with a name and URL.
- Configure a supported check interval.
- Configure a request timeout.
- Configure the expected HTTP status; default is 200.
- View monitor details and current status.
- Edit, pause, resume, and delete their monitors.
- Request a manual check subject to rate limits.

Initial interval choices: 1, 5, 10, 20, and 30 minutes. These are product defaults for the first release and must be validated against scheduler limits, platform quotas, and abuse controls before launch. The default interval is **10 minutes**.

Default request timeout: **10 seconds**.

### 7.2 HTTP checks

- Use HTTP GET for the first release.
- Support HTTP and HTTPS URLs only.
- A check succeeds only when the response status equals the monitor's configured expected status; default HTTP 200.
- A check fails on timeout, connection/DNS/TLS error, or unexpected HTTP status.
- Record response time in milliseconds.
- Record the check timestamp in UTC.
- Record a safe, concise error description on failure.
- Apply strict response-size and execution-time limits.
- Redirect handling must not permit SSRF protection bypasses.

### 7.3 Monitoring history

Each check record should include:
- Monitor identifier.
- Execution timestamp in UTC.
- Result status (UP or DOWN).
- HTTP status code, when a response was received.
- Response time in milliseconds, when measurable.
- Failure category and safe error message, when applicable.

History views must be paginated and support useful time ranges.

### 7.4 Incidents

- Detect sustained failures using a documented consecutive-failure policy.
- Record incident start, last failure, and recovery time.
- Avoid creating a new incident for every failed check while an incident remains open.
- Record recovery when a successful check follows an open incident.
- Keep raw check results distinct from derived incident state.

### 7.5 Dashboard

The initial dashboard should show:
- Overall monitor counts and current state.
- Individual monitor status.
- Uptime percentage for a selected time range.
- Response-time line chart.
- Recent incidents and recoveries.
- Recent check history.

Do not invent uptime percentages when there is insufficient observation history. Explain the selected calculation window and treatment of missing checks.

### 7.6 Notifications

The first notification channel is email. Notify users when a monitor enters a confirmed down state and when it recovers. Notification thresholds, deduplication, user preferences, and delivery failures must be explicit.

## 8. Security and abuse prevention

- Enforce ownership checks for all user monitor operations.
- Validate URLs server-side.
- Reject localhost, loopback, private, link-local, multicast, reserved, and prohibited destinations.
- Resolve DNS safely and prevent DNS rebinding and redirect-based SSRF.
- Revalidate every redirect destination or disable redirects.
- Restrict outbound ports and protocols.
- Apply per-account monitor limits, interval minimums, request concurrency limits, and manual-check rate limits.
- Never allow users to supply arbitrary outbound headers, bodies, or methods in the initial release.
- Protect authentication and session data.
- Do not expose internal network details in errors or logs.

## 9. Reliability and operational requirements

- The scheduler must be independent of the monitored application.
- Scheduler execution may be delayed by platform scheduling; the UI must not promise exact-to-the-second execution.
- Handle duplicate or overlapping scheduler invocations idempotently.
- Use durable storage for monitor configuration and check results.
- Define retention and cleanup policies before production launch.
- Instrument scheduler failures separately from target failures.
- Monitor the monitoring system itself using an independent provider.

## 10. Initial acceptance criteria

- A user can register a valid public HTTP/HTTPS URL.
- A user can select a supported interval, with 10 minutes as the default.
- A scheduled GET check executes without the user's device or browser running.
- A response with the expected HTTP status is recorded as UP.
- Timeout, connection errors, and unexpected HTTP statuses are recorded as DOWN.
- Each result stores status, timestamp, response time when available, and failure details when applicable.
- Users can view check history and current status.
- URL validation blocks private and unsafe network destinations.
- Existing monitor configurations survive service restarts.
- Tests cover successful checks, non-success status, timeout, connection errors, scheduler duplication, and SSRF defenses.

## 11. Release milestones

1. **Foundation:** repository conventions, architecture, API contract, environments.
2. **Monitoring engine:** one configured target checked by the independent worker.
3. **Persistence:** Cloudflare D1 stores Worker monitor configurations and check results; account ownership and frontend synchronization remain separate integration work.
4. **Backend API:** authenticated monitor management and history endpoints.
5. **Frontend MVP:** create monitor, list monitors, detail and history views.
6. **Incidents and notifications:** failure thresholds, recovery, email.
7. **Production hardening:** quotas, retention, observability, security review, deployment runbooks.

## 12. Success measures

- Successful scheduled execution rate.
- Percentage of checks with persisted results.
- Time between target failure and APIMON detection.
- False-positive and false-negative rates.
- Notification delivery success.
- User ability to create a monitor without assistance.

All measures must be calculated from recorded data and documented definitions.
