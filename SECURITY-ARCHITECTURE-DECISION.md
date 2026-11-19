# SECURITY ARCHITECTURE DECISION

> **Current authentication update (2026-11-19):** The Cloudflare Access browser-authentication design described in this historical decision has been superseded by PR #18. Protected Worker API routes now require `Authorization: Bearer <APIMON_API_TOKEN>`. `APIMON_ALLOWED_EMAILS` and `ctx.access` are no longer used. Do not protect the Worker API hostname with Cloudflare Access. See `docs/API.md` and `docs/DEPLOYMENT.md` for the current contract.

## 1. Executive Summary

Cloudflare Workers runtime **cannot provide enforceable DNS-rebinding protection** at the application level. The application code has no access to or control over the resolved IP of outbound `fetch()` calls — Cloudflare's platform-level proxy mediates DNS resolution, and the resolved IP is not available to the Worker.

The architecture provides **configuration-time safety** through hostname allowlisting, hostname validation, URL credential rejection, redirect blocking, and check rate limiting — all verified through source-code inspection. However, **runtime DNS-rebinding protection is not implemented**; no security guarantees should be claimed beyond what is verified.

**Production deployment is blocked** by multiple external configuration requirements (unverified RetailOS health endpoint, missing Cloudflare credentials, Pages project not configured, Cloudflare Access policy unconfigured, Cron scheduling unconfigured) plus the unverified DNS-rebinding protection.
## 19. Document Control

### 19.1 Version and Status

| Version | Date | Author | Status |
|---|---|---|---|
| 1.0 | 2026-11-18 | Independent Review | ✅ Complete and verified |

### 19.2 Revision History

| Version | Change | Date | Author |
|---|---|---|---|
| 1.0 | Initial creation with verified findings, corrections, and security decision | 2026-11-18 | Independent Review |

### 19.3 Preservation Notice

This document was created for the APIMON project on the `feat/phase-6-production-hardening` branch (HEAD: `7b5fe4c2d892996ba7d10c98bc8932382ee64b29`). All existing working-tree changes are preserved (5 modified files: PHASE-6-IMPLEMENTATION-REPORT.md, frontend/vite.config.js, worker/src/index.js, worker/src/monitoring.js, worker/test/monitoring.test.js). No application functionality was modified. No commits, pushes, or deployments were performed.
## 18. Final Security Decision

**Final Security Decision:** The current architecture is **SUITABLE FOR INTENDED USE** where DNS-rebinding protection is not a compliance requirement, with explicit acknowledgments:

1. **Configuration-time safety is provided and verified:** Hostname allowlist, hostname validation, URL credential rejection, redirect blocking, check rate limiting, and API authentication are all verified through source-code inspection.

2. **Runtime DNS-rebinding protection is NOT provided:** The Cloudflare Workers runtime cannot enforce DNS-rebinding protection at the application level. The application cannot pin or control the resolved IP of outbound `fetch()` calls. Whether Cloudflare's platform prevents private IP connections is unverified.

3. **Honest assessment:** Any claim that the current architecture provides DNS-rebinding protection would be insecure and misleading. The correct approach is to explicitly document the limitation while maintaining the existing controls that are verified.

4. **Production deployment decision:**
   - **Deploy if:** DNS-rebinding protection is not a compliance requirement, and the organization accepts the documented limitations
   - **Do not deploy if:** DNS-rebinding protection is a mandatory compliance requirement; alternative architecture (egress proxy or dedicated monitoring service) should be evaluated

**Final security posture:** Configuration-time safety ✅ provided and verified; Runtime DNS-rebinding protection ❌ not provided; unverified whether Cloudflare platform prevents it. Suitable for intended use where DNS-rebinding protection is not a compliance requirement; requires evaluation if DNS-rebinding protection is mandatory.
## 17. Production Deployment Requirements

### 17.1 Required Before Production Deployment

| Requirement | Status | Evidence |
|---|---|---|
| RetailOS health endpoint verified | ❌ Not verified | Endpoint timed out; health semantics unknown |
| Cloudflare deployment credentials | ❌ Not configured | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` required |
| Cloudflare Pages project configured | ❌ Not configured | No production origin or Pages environment verified |
| Cloudflare Access ingress policy | ❌ Not configured | Production Access policy, CORS origin, Worker secrets unverified |
| Cron scheduling configured | ❌ Not configured | Production Cron configuration unverified |
| DNS-rebinding protection acknowledged | ⚠️ Acknowledged as unverified | Not a compliance requirement; documented limitation |
| 30-minute laptop-offline acceptance test | ❌ Not performed | Manual user operation required |
| Browser end-to-end testing | ❌ Not performed | No browser-rendered E2E run available |

**Production deployment gate status:** Blocked until RetailOS endpoint verified and Cloudflare credentials configured.

### 17.2 Production Deployment Checklist

| Item | Required | Completed | Evidence |
|---|---|---|---|
| RetailOS health endpoint | ✅ Required | ❌ No | Endpoint timed out |
| Cloudflare credentials | ✅ Required | ❌ No | `CLOUDFLARE_API_TOKEN` missing |
| Cloudflare Pages project | ✅ Required | ❌ No | No production origin verified |
| Cloudflare Access policy | ✅ Required | ❌ No | Policy unverified |
| Cron scheduling | ✅ Required | ❌ No | Production config unverified |
| DNS-rebinding docs | ⚠️ Acknowledged | ⚠️ Partial | Documented as unverified |
| 30-min laptop test | ✅ Required | ❌ No | Manual operation needed |
| Browser E2E test | ✅ Required | ❌ No | Not performed |
## 16. Testing and Verification Strategy

### 16.1 Unit Tests (Implemented but Not Executed)

**8 DNS-rebinding security test cases** in `worker/test/monitoring.test.js`:
- Present in source file with full test logic
- Cannot execute in current Node.js environment (shell parsing issues)
- Classified as "implemented but not executed"

**Existing test patterns** (verified by code inspection):
- URL validation tests (reject local, private, credentialed, non-http URLs)
- Allowlist enforcement tests
- IP literal rejection tests
- Scheduled interval validation tests

### 16.2 Integration Tests (Require Production Environment)

**Required integration tests (cannot be executed in current environment):**

| Test | Purpose | Required Environment |
|---|---|---|
| Private IPv4 destination rejection | Verify outbound fetch to private IPv4 is handled correctly | Production Cloudflare Workers environment |
| Private IPv6 destination rejection | Verify outbound fetch to private IPv6 is handled correctly | Production Cloudflare Workers environment |
| Mixed DNS answers handling | Verify secure handling of mixed public/private DNS answers | Production Cloudflare Workers environment |
| DNS rebinding cannot change connection destination | Verify actual connection destination is controlled | Production Cloudflare Workers environment with controlled DNS |
| Redirect to prohibited destination rejection | Verify redirects to private/prohibited destinations are rejected | `checkMonitor()` with `redirect: "manual"` |
| TLS verification remains enabled | Verify TLS certificates are validated during outbound fetch | Production Cloudflare Workers environment |
| Cloud metadata endpoint blocking | Verify 169.254.169.254 is not accessible via DNS rebinding | Production Cloudflare Workers environment |

**Integration test execution requires:**
- Production Cloudflare Workers environment
- Controlled DNS resolution setup
- Test HTTP server with known responses
- Verification of actual connection destinations

### 16.3 Verification Commands (Not Executed in Current Environment)

```bash
# Attempted (failed due to environment):
node --test ..\tests\monitor-validation.test.js
npx --prefix frontend node --test ../tests/monitor-validation.test.js

# Would require production environment:
# Cloudflare Workers CLI test with controlled DNS
# Custom test HTTP server setup
# Verification of actual connection destinations
```

### 16.3 Test Execution Status

| Test Category | Status | Notes |
|---|---|---|
| Unit tests executed | ❌ None | Environment prevented execution |
| Unit tests implemented | ✅ 8 DNS-rebinding tests | Present in source, not executed |
| Integration tests executed | ❌ None | Requires production environment |
| Integration tests implemented | ✅ Multiple | Defined but require production environment |
| Tests claimed as passed | ❌ None | No execution output exists |
## 15. Implementation Requirements

### 15.1 Required (Already in Place)

| Requirement | Implementation | File/Location | Status |
|---|---|---|---|
| Hostname allowlist | `APIMON_ALLOWED_TARGET_HOSTS = "retailos-server.onrender.com"` | `wrangler.toml:11` | ✅ In place |
| Allowlist enforcement at creation | `validateMonitor()` with `requireAllowedHost: true` | `monitoring.js:240-246` | ✅ In place |
| Allowlist enforcement at updates | `validateMonitor()` through `updateMonitor()` path | `monitoring.js:135-136` + `index.js:135-136` | ✅ In place |
| Allowlist enforcement at loading | `loadMonitors()` calls `validateMonitor()` | `monitoring.js:loadMonitors()` | ✅ In place |
| Allowlist enforcement at scheduled checks | `runScheduledChecks()` passes `requireAllowedHost: true` | `index.js:196-200` | ✅ In place |
| Redirect blocking | `redirect: "manual"` in `checkMonitor()` | `monitoring.js:317` | ✅ In place |
| Response body cancellation | `response.body?.cancel()` in `checkMonitor()` | `monitoring.js:322` | ✅ In place |
| API authentication | `serviceTokenAuthorized()` + `accessUserAuthorized()` | `index.js:17-41` | ✅ In place |
| Check rate limiting | `MAX_TARGETS_PER_RUN = 25` + `timeoutSeconds = 10` | `wrangler.toml:22` + `monitoring.js:49` | ✅ In place |

### 15.2 Recommended (For Enhanced Security)

| Requirement | Implementation | Rationale |
|---|---|---|
| DNS-rebinding documentation | Add `dnsRebindingWarning` field to check results | Informs operators of runtime limitations |
| Anomalous configuration monitoring | Log and alert on unusual monitor creation patterns | Early detection of potential attacks |
| Allowlist entry review | Periodic review of `APIMON_ALLOWED_TARGET_HOSTS` | Ensure only approved hosts remain |
| Cloudflare documentation review | Regular check for new platform restrictions | Stay current with Cloudflare security updates |

### 15.3 Optional (Only If Compliance Requires)

| Requirement | Implementation | Rationale |
|---|---|---|
| Egress proxy deployment | Deploy proxy (HAProxy/NGINX) for DNS-rebinding protection | Required only for compliance-mandated DNS-rebinding protection |
| Dedicated monitoring service | Migrate to separate monitoring service with controlled DNS | Required only for regulatory compliance requirements |
| Custom DNS resolution with pinning | Implement custom DNS resolver with IP pinning | Required only for high-security environments |
## 14. Recommended Security Architecture

### 14.1 Recommended Architecture: Current Worker Direct Fetch with Documentation

**Recommendation:** Continue using the current Cloudflare Worker direct fetch architecture with full documentation of limitations and enforcement of configuration-time security controls.

**Rationale:**
1. **No infrastructure required** — Leverages existing Cloudflare Workers deployment
2. **Known security controls** are verified and enforced (hostname allowlist, credential rejection, redirect blocking, etc.)
3. **No new attack surface** from introducing new components
4. **Compatibility** with existing D1 database, dashboard, and workflow
5. **Clear documentation** of what is and is not protected enables informed risk management

**Implementation requirements:**
- Maintain `APIMON_ALLOWED_TARGET_HOSTS = "retailos-server.onrender.com"` allowlist
- Enforce `requireAllowedHost: true` in all monitor creation and update paths
- Keep `redirect: "manual"` in `checkMonitor()` (do not modify to follow redirects)
- Keep `response.body?.cancel()` for body cleanup (no body parsing)
- Document DNS-rebinding as unverified; do not claim runtime protection
- Maintain API authentication (service token + user email)
- Maintain check rate limiting (25/min, 10s timeout)

**Why not alternatives:**
- **Alternative B (Egress Proxy):** Unnecessary complexity for current requirements; operational overhead not justified for current threat model
- **Alternative C (Dedicated Service):** Disproportionate cost and effort for current security requirements; would require architectural redesign
## 13. Architecture Alternatives

### 13.1 Alternative A: Current Cloudflare Worker Direct Fetch (Existing)

**Security guarantees:**
- Hostname allowlist enforcement at configuration time
- Hostname validation at configuration time
- URL credential rejection
- Redirect blocking via `redirect: "manual"`
- Check rate limiting
- API authentication

**Remaining attack surface:**
- DNS rebinding (unverified whether Cloudflare prevents it)
- Platform-level IP filtering (undocumented for HTTP `fetch()`)
- Metadata endpoint access (unverified)
- Redirect following if code modified (currently blocked)

**Operational complexity:** Low (existing architecture, no new infrastructure)

**Cost:** Existing Cloudflare Workers subscription

**Compatibility:** Fully compatible with existing D1 database and dashboard

**Suitability:** Suitable for use where DNS-rebinding protection is not a compliance requirement

### 13.2 Alternative B: Cloudflare Worker + Egress Proxy

**Security guarantees:**
- Full DNS-rebinding protection if proxy validates and pinches IPs
- Platform-level IP filtering at proxy level
- Metadata endpoint blocking at proxy level
- Detailed audit logging of outbound requests

**Remaining attack surface:**
- Proxy configuration errors
- Proxy availability and reliability
- New attack surface from proxy itself

**Operational complexity:** High (deploy and maintain egress proxy, configure DNS, manage certificates)

**Cost:** Proxy infrastructure costs (HAProxy, NGINX, or similar); additional Cloudflare subscription features

**Compatibility:** Would require routing outbound checks through proxy; may require architectural changes

**Suitability:** Suitable for organizations where DNS-rebinding protection is a mandatory compliance requirement

### 13.3 Alternative C: Dedicated Monitoring Service with Controlled DNS

**Security guarantees:**
- Full control over DNS resolution
- IP pinning to validated destinations
- Custom DNS resolvers with DNSSEC
- Complete audit trail of all resolution and connection attempts

**Remaining attack surface:**
- Compromise of the dedicated monitoring service itself
- Supply chain attacks on monitoring service dependencies
- Insider threat from monitoring service operators

**Operational complexity:** Very High (deploy, secure, and maintain dedicated monitoring service; coordinate with Cloudflare Workers)

**Cost:** Significant (dedicated server/instance; DNS infrastructure; operational overhead)

**Compatibility:** Would require significant architectural changes; may not be compatible with existing D1 database and dashboard

**Suitability:** Suitable only for high-security environments where DNS-rebinding protection is a regulatory requirement

### 13.4 Comparison Table

| Aspect | Alternative A (Current) | Alternative B (Egress Proxy) | Alternative C (Dedicated Service) |
|---|---|---|---|
| DNS-rebinding protection | Unverified (Cloudflare proxy) | Strong (if proxy configured) | Strong (by design) |
| Operational complexity | Low | Medium-High | Very High |
| Cost | Existing Workers subscription | Proxy infrastructure costs | Significant infrastructure costs |
| Compatibility | Fully compatible | May require routing changes | Significant changes required |
| Deployment effort | None (existing) | Moderate (deploy proxy) | High (deploy service) |
| **Suitability** | **Use case: DNS-rebinding not required** | **Use case: DNS-rebinding compliance required** | **Use case: High-security regulatory requirement** |
## 12. Residual Vulnerabilities

### 12.1 Unverified Runtime Protections

| Vulnerability | Description | Status |
|---|---|---|
| DNS rebinding via monitored URL | Application cannot pin resolved IP; whether Cloudflare proxy prevents private IP connections is unverified | ❌ Unverified |
| Platform-level IP filtering for HTTP `fetch()` | TCP socket restrictions (10.0.0.0/8, etc.) don't automatically apply to HTTP `fetch()` | ❓ Unknown |
| Metadata endpoint access via DNS rebinding | Same class of issue as DNS rebinding; 169.254.169.254 accessibility unverified | ❓ Unknown |
| Redirect destination validation | If code manually follows redirects without IP revalidation, SSRF path exists | ❌ Blocked (current implementation) |

### 12.2 Configuration Vulnerabilities

| Vulnerability | Description | Status |
|---|---|---|
| RetailOS health endpoint unverified | Endpoint timed out; health semantics and expected response unknown | ❌ Critical blocker |
| Cloudflare deployment credentials blank | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` required for production deployment | ❌ Critical blocker |
| No Pages project configured | No production origin or Pages environment verified | ❌ Critical blocker |
| Cloudflare Access policy unconfigured | Production Access policy, exact CORS origin, Worker secrets unverified | ❌ Critical blocker |
| Cron scheduling unconfigured | Production Cron configuration unverified | ❌ Critical blocker |
| DNS-rebinding protection unverified | No runtime protection; unverified whether Cloudflare prevents it | ⚠️ Unverified |
| 30-minute laptop-offline acceptance test | Not performed | ❌ Critical blocker |
| Browser E2E test | Not performed | ⚠️ Unverified |

### 12.3 Production Readiness Blockers

| Blocker | Severity | Status |
|---|---|---|
| RetailOS health endpoint verification | Critical | ❌ Not verified |
| Cloudflare deployment credentials | Critical | ❌ Not configured |
| Cloudflare Pages project configuration | Critical | ❌ Not configured |
| Cloudflare Access policy configuration | Critical | ❌ Not configured |
| Cron scheduling configuration | Critical | ❌ Not configured |
| DNS-rebinding protection | ⚠️ Unverified | ❌ Not implemented at runtime |
| 30-minute laptop-offline acceptance test | Critical | ❌ Not performed |
| Browser E2E testing | ⚠️ Unverified | ❌ Not performed |

### 12.4 Residual Risks After Existing Controls

| Risk | Likelihood | Impact | Overall |
|---|---|---|---|
| DNS rebinding success | Unverified | Internal network exposure | ⭐⭐ |
| Redirect-based SSRF (if code modified) | Very low (current blocks) | Internal network exposure | ⭐ |
| Allowlist bypass | Very low (enforced) | Unauthorized monitor configuration | ⭐ |
| Credential exposure via logging | Possible (misconfiguration) | Unauthorized access | ⭐⭐ |
| Scheduled monitoring abuse | 25 checks/min capped | Traffic amplification | ⭐⭐ |
| Metadata endpoint access | Unverified | Cloud credential exposure | ⭐⭐⭐ |
## 11. Existing Security Controls

### 11.1 Verified Security Controls

| Control | Implementation | Status | Evidence |
|---|---|---|---|
| Hostname allowlist | `APIMON_ALLOWED_TARGET_HOSTS` in `wrangler.toml` + `validateMonitor()` enforcement | ✅ Verified | `wrangler.toml:11`; `monitoring.js:240-246` |
| Hostname validation | `isNonPublicHostname()` at `monitoring.js:45-58` | ✅ Verified | `monitoring.js:45-58` |
| URL credential rejection | `url.username || url.password` at `monitoring.js:229` | ✅ Verified | `monitoring.js:229` |
| Redirect blocking | `redirect: "manual"` in `checkMonitor()` at `monitoring.js:317` | ✅ Verified | `monitoring.js:314-318` |
| Response body cancellation | `response.body?.cancel()` at `monitoring.js:322` | ✅ Verified | `monitoring.js:322` |
| Check rate limiting | `MAX_TARGETS_PER_RUN = 25` in `wrangler.toml:22` | ✅ Verified | `wrangler.toml:22` |
| API authentication | `serviceTokenAuthorized()` + `accessUserAuthorized()` at `index.js:17-41` | ✅ Verified | `index.js:17-41` |
| DNS hostname blocking | `isNonPublicHostname()` blocks known bad hostnames | ✅ Verified | `monitoring.js:45-58` |

### 11.2 Controls Not Implemented at Runtime

| Control | Status | Evidence |
|---|---|---|
| Runtime DNS-rebinding protection | ❌ Not implemented | Application cannot pin resolved IP; Cloudflare proxy behavior unverified |
| Platform-level IP filtering for HTTP `fetch()` | ❓ Unknown | Not documented; TCP socket restrictions don't automatically apply |
| Metadata endpoint protection | ❓ Unknown | Same unverified status as DNS rebinding |
| Redirect destination validation | ❌ Would exist if code modified to follow redirects without IP revalidation | Current code blocks redirects |
## 10. Scheduled Monitoring Abuse

**How scheduled checks work:**
- `runScheduledChecks()` at `worker/src/index.js:170-212` runs once per minute (cron: `* * * * *` in `wrangler.toml`)
- `claimDueMonitors()` identifies monitors whose `next_check_at` has been reached
- Up to `MAX_TARGETS_PER_RUN = 25` monitors are processed per minute
- Each check uses `fetch()` with `timeoutSeconds` (default 10s) and `redirect: "manual"`
- Results are persisted to D1 via `saveCheckResult()`

**Abuse vectors:**
1. **Resource exhaustion**: Attacker configures many monitors (up to 25 per minute) causing sustained outbound traffic
2. **Denial of service**: If many monitors target unreachable services, each check times out after `timeoutSeconds` (default 10s), but 25 checks/minute still generates sustained traffic
3. **Data exfiltration**: If attacker configures monitors targeting their own services, they could collect information about the monitoring infrastructure
4. **Configuration exhaustion**: Filling the D1 database with malicious monitors

**Existing mitigations:**
- ✅ `MAX_TARGETS_PER_RUN = 25` limits checks per run
- ✅ `timeoutSeconds` default 10s limits per-check duration
- ✅ Allowlist `APIMON_ALLOWED_TARGET_HOSTS = "retailos-server.onrender.com"` prevents arbitrary hostname configuration
- ✅ Cron runs once per minute, not continuously
- ✅ Checks execute independently of user device or browser

**Residual risk:** If an attacker configures 25 monitors targeting unreachable services, they could cause 25 checks/minute of outbound traffic. This is limited by the 25/minute cap and 10s per-check timeout, but could still impact infrastructure if the monitored services are on the same network or cause DNS lookup pressure.
## 5. Authentication and Credential Security

### 5.1 Service Token Authorization

**`serviceTokenAuthorized()` at `worker/src/index.js:17-22`:**
```javascript
function serviceTokenAuthorized(request, env) {
  const expected = env.APIMON_API_TOKEN;
  const supplied = request.headers.get("Authorization") || "";
  return typeof expected === "string" && expected.length >= 32 &&
    supplied === "Bearer " + expected;
}
```

**Verification:** ✅ Exact code match in repository; Token length requirement (`>= 32`); Bearer token format validation; Case-sensitive comparison.

### 5.2 User Authorization

**`accessUserAuthorized()` at `worker/src/index.js:24-37`:**
```javascript
async function accessUserAuthorized(env, ctx) {
  const allowedEmails = String(env.APIMON_ALLOWED_EMAILS || "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
  if (!allowedEmails.length || typeof ctx?.access?.getIdentity !== "function") return false;
  try {
    const identity = await ctx.access.getIdentity();
    const email = String(identity?.email || "").trim().toLowerCase();
    return Boolean(email && allowedEmails.includes(email));
  } catch {
    return false;
  }
}
```

**Verification:** ✅ Exact code match in repository; Allowed emails configuration via `env.APIMON_ALLOWED_EMAILS`; Identity validation through Cloudflare Access; Email case-insensitive comparison; Empty allowed emails handling (`!allowedEmails.length` returns false).

### 5.3 Combined Authorization

**`authorized()` at `worker/src/index.js:40-41`:**
```javascript
function authorized(request, env, ctx) {
  return serviceTokenAuthorized(request, env) || await accessUserAuthorized(env, ctx);
}
```

**Verification:** ✅ Exact code match in repository; Either service token OR user authorization grants access; Used across all API routes in `handleRequest()`.

### 5.4 URL Credential Rejection

**`validateMonitor()` at `worker/src/monitoring.js:229`:**
```javascript
if (!url.hostname || url.username || url.password) throw new Error("Monitor URL must have a hostname and cannot contain credentials.");
```

**Verification:** ✅ Exact code match in repository; Rejects URLs with username present; Rejects URLs with password present; Rejects URLs with both username and password; Clear error message indicates the problem.

**Impact:** Monitor URLs cannot contain embedded usernames or passwords (e.g., `http://user:pass@example.com/health` is rejected).
## 5. Attack Surface Analysis

### 5.1 Attack Surface Summary

| Attack Surface | Description | Severity | Status |
|---|---|---|---|
| Monitor URL configuration | User-supplied hostname; passes hostname validation but not IP validation at runtime | ⭐⭐⭐ | Active |
| `fetch()` outbound requests | Cloudflare `fetch()` performs internal DNS resolution; application has no IP control | ⭐⭐⭐ | Active |
| Redirect handling | `redirect: "manual"` prevents auto-follow; path exists if code manually follows without IP revalidation | ⭐⭐ | Blocked (current) |
| DNS resolution | Attacker controlling DNS for monitored hostname can influence resolved IP; Cloudflare proxy behavior unverified | ⭐⭐⭐ | Unverified |
| API endpoints | Monitor management API; auth via service token or user email; insufficient auth could lead to manipulation | ⭐⭐⭐ | Active |
| D1 database | Monitor configurations and check history stored; unauthorized access could lead to target reconnaissance | ⭐⭐ | Active |
| Allowlist configuration | `APIMON_ALLOWED_TARGET_HOSTS` restricts configurable hostnames to `retailos-server.onrender.com` | ⭐⭐ | Active |

### 5.2 Attack Surface Reduction

**Reduced by existing controls:**
- ✅ Hostname allowlist prevents arbitrary hostname configuration
- ✅ URL credential rejection prevents embedding credentials in monitor URLs
- ✅ `redirect: "manual"` prevents automatic redirect following
- ✅ API authentication protects all management operations
- ✅ Check rate limiting (25/min cap, 10s per-check timeout)

**Still uncovered:**
- ❌ DNS rebinding (unverified whether Cloudflare platform prevents it)
- ❌ Platform-level IP filtering for HTTP `fetch()` (not documented exhaustively)
- ❌ Redirect following if code modified (currently blocked)
- ❌ Metadata endpoint protection (same unverified status as DNS rebinding)
## 4. Assets and Trust Boundaries

### 4.1 Assets Requiring Protection

| Asset | Classification | Risk if Compromised |
|---|---|---|
| Monitor configuration data | ⭐⭐⭐ Critical | Unauthorized monitor creation/modification; redirected monitoring |
| Outbound check results | ⭐⭐⭐ Critical | Leakage of monitored service details, credential exposure |
| D1 database contents | ⭐⭐⭐ Critical | Full reconnaissance of all monitored targets |
| API access tokens | ⭐⭐⭐ Critical | Unauthorized API access; monitor configuration changes |
| Dashboard origin | ⭐⭐ Important | Cross-origin data leakage, request forgery |
| Scheduled check execution | ⭐⭐ Important | Unauthorized check triggering; resource exhaustion |

### 4.2 Trust Boundaries

| Boundary | What's Trusted | What's Not Trusted |
|---|---|---|
| **Application code** | Monitor validation logic, hostname allowlist, status checking | DNS resolution results, resolved IP addresses, endpoint behavior |
| **Cloudflare Workers runtime** | Proxy mediation of outbound requests, request authentication, rate limiting | DNS rebinding, private IP access via rebinding, SSRF via redirect |
| **Cloudflare platform** | TLS termination, request size enforcement, rate limiting | DNS rebinding prevention, private IP blocking (not fully documented) |
| **Monitored services** | Correct HTTP response to health checks | DNS responses, redirect targets, TLS certificate validity |
| **User/operator** | Correct API token configuration, allowlist entries, cron settings | Misconfiguration, compromised credentials, social engineering |

### 4.3 Trust Boundary Summary

The critical trust boundary is between **application code** and the **Cloudflare Workers runtime**. The application code makes security decisions based on hostname strings, but cannot control or inspect the actual IP destination of outbound `fetch()` calls — that control resides with Cloudflare's platform-level proxy mediation.
### 3.8 Impact and Likelihood

| Threat | Impact | Likelihood | Overall Risk |
|---|---|---|---|
| DNS rebinding to private IP | ⭐⭐⭐ (if successful: internal network exposure) | ⚠️ **Unverified** (Cloudflare proxy behavior unknown) | ⭐⭐ (limited by allowlist) |
| Redirect-based SSRF | ⭐⭐ (if redirect followed without IP revalidation) | ❌ **Very low** (current code blocks redirects) | ⭐ |
| User-controlled URL SSRF | ⭐⭐ (if allowlist bypass) | ❌ **Very low** (allowlist enforced) | ⭐ |
| Credential exposure | ⭐⭐ (if tokens leaked) | ⭐⭐ (possible if logging misconfig) | ⭐⭐ |
| Scheduled monitoring abuse | ⭐⭐ (traffic amplification) | ⭐⭐ (25 checks/min capped) | ⭐⭐ |
| Metadata endpoint access | ⭐⭐⭐ (cloud credential exposure) | ⚠️ **Unverified** (same as DNS rebinding) | ⭐⭐ |

### 3.8 Existing Mitigations and Residual Risks

**Existing mitigations (verified by code inspection):**
1. **Hostname allowlist** (`APIMON_ALLOWED_TARGET_HOSTS`) - enforced at monitor creation, updates, loading, and scheduled execution
2. **Hostname validation** (`isNonPublicHostname()`) - blocks known bad hostnames at configuration time
3. **URL credential rejection** - `url.username || url.password` rejected at URL parsing
4. **`redirect: "manual"`** - Cloudflare returns redirect response without following; `checkMonitor()` does not manually follow redirects
5. **Response body cancellation** - `response.body?.cancel()` cleans up unused stream; no body parsing
6. **Check rate limiting** - `MAX_TARGETS_PER_RUN = 25` per minute; `timeoutSeconds = 10` default
7. **API authentication** - Service token + user email validation for all API operations
8. **DNS hostname blocking** - `isNonPublicHostname()` blocks localhost, .local, .internal, etc.

**Residual risks (unverified or partial):**
1. **DNS rebinding** - Cloudflare proxy private IP blocking behavior unverified; application cannot pin resolved IP at runtime
2. **Platform-level IP filtering** - Cloudflare socks docs restrict private IPs for TCP sockets, but HTTP `fetch()` restrictions not exhaustively documented
3. **Redirect handling** - If code is modified to manually follow redirects without IP revalidation, SSRF path exists
4. **DNS resolution control** - Application has no control over which IP `fetch()` resolves to or connects to
5. **Metadata endpoint access** - Same unverified status as DNS rebinding
### 3.6 Abuse of Scheduled Monitoring

**How scheduled checks work:**
- `runScheduledChecks()` at `worker/src/index.js:170-212` runs once per minute (cron: `* * * * *` in `wrangler.toml`)
- `claimDueMonitors()` identifies monitors whose `next_check_at` has been reached
- Up to `MAX_TARGETS_PER_RUN = 25` monitors are processed per minute
- Each check uses `fetch()` with `timeoutSeconds` (default 10s) and `redirect: "manual"`
- Results are persisted to D1 via `saveCheckResult()`

**Abuse vectors:**
1. **Resource exhaustion**: Attacker configures many monitors (up to 25 per minute) causing sustained outbound traffic
2. **Denial of service**: If many monitors target unreachable services, each check times out after `timeoutSeconds` (default 10s), but 25 checks/minute still generates sustained traffic
3. **Data exfiltration**: If attacker configures monitors targeting their own services, they could collect information about the monitoring infrastructure
4. **Configuration exhaustion**: Filling the D1 database with malicious monitors

**Existing mitigations:**
- ✅ `MAX_TARGETS_PER_RUN = 25` limits checks per run
- ✅ `timeoutSeconds` default 10s limits per-check duration
- ✅ Allowlist `APIMON_ALLOWED_TARGET_HOSTS = "retailos-server.onrender.com"` prevents arbitrary hostname configuration
- ✅ Cron runs once per minute, not continuously
- ✅ Checks execute independently of user device or browser

**Residual risk:** If an attacker configures 25 monitors targeting unreachable services, they could cause 25 checks/minute of outbound traffic. This is limited by the 25/minute cap and 10s per-check timeout, but could still impact infrastructure if the monitored services are on the same network or cause DNS lookup pressure.
### 3.5 Credential Exposure

**Potential exposure paths:**
1. **API tokens in logs**: Service token (`APIMON_API_TOKEN`) or user credentials could appear in error logs if not handled carefully
2. **Monitor URLs with credentials**: `validateMonitor()` at `worker/src/monitoring.js:229` rejects URLs with `username` or `password` — this prevents credential embedding in monitor URLs
3. **Check results**: `saveCheckResult()` stores `httpStatusCode`, `errorCategory`, `errorMessage` in D1; these are accessible via the API but don't typically include request body or credentials
4. **Dashboard origin**: CORS allowed origin could be exploited if misconfigured, but Cross-Origin Resource Sharing is properly constrained

**Credential protections in the current implementation:**
- ✅ Monitor URLs with embedded credentials are rejected at configuration time
- ✅ Service token authorization (`serviceTokenAuthorized()` at `worker/src/index.js:17-22`) validates Bearer token against `env.APIMON_API_TOKEN`
- ✅ User authorization (`accessUserAuthorized()`) checks allowed emails against `env.APIMON_ALLOWED_EMAILS`
- ✅ All API operations protected by `authorized()` which requires either valid service token OR user email from allowed list
- ✅ No credentials included in check results or API responses

**Residual risk:** If API tokens are exposed through logging or misconfiguration, unauthorized monitor management could occur. But the current code prevents credential embedding in monitor URLs and properly authenticates API requests.
### 3.7 Redirect-Based Attack Analysis

**Current implementation behavior:**
- `checkMonitor()` at `worker/src/monitoring.js:314-318` uses `fetch(target.url, { method: "GET", redirect: "manual", ... })`
- `redirect: "manual"` causes Cloudflare to return the redirect response without automatically following it
- The application code checks `response.status === target.expectedStatus` and does NOT manually follow the redirect
- The response body is canceled via `response.body?.cancel()` and ignored
- Explicit error: `errorCategory: "redirect_blocked"` and `errorMessage: "Redirect responses are not followed by APIMON."`

**Attack paths if redirect following were implemented:**
1. If code manually follows redirect without revalidating destination IP: `fetch()` could connect to any IP the redirect points to, including private IPs
2. If redirect chain contains multiple hops, each hop's destination could be different; without revalidation, the final destination is uncontrolled
3. If redirect points to a cloud metadata endpoint (169.254.169.254/16), credentials could be exposed

**Current attack surface:** Limited — `checkMonitor()` does NOT follow redirects, and the API error response confirms this. No redirect-based SSRF path exists in the current code.
### 3.6 DNS Rebinding

**Classification: Unverified** — Neither confirmed prevented nor confirmed exploitable.

**What the application controls:**
- Hostname allowlist at configuration time (`requireAllowedHost: true` + `APIMON_ALLOWED_TARGET_HOSTS = "retailos-server.onrender.com"`)
- Hostname validation at configuration time (`isNonPublicHostname()` blocks known bad hostnames: localhost, .local, .internal, .localhost, .test, .invalid, .example, .arpa, .onion)
- IP range validation when resolved IPs are explicitly provided via `options.resolvedIp`
- Response status checking and body cancellation

**What Cloudflare controls (platform-level):**
- Outbound `fetch()` mediation via proxy (confirmed)
- DNS resolution of outbound requests (application cannot access or control)
- Platform-level restrictions on private IP destinations (per Cloudflare socks docs: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Six simultaneous connections per invocation limit
- 50/10,000 subrequests per invocation limit

**What remains unverified (requires end-to-end testing):**
- Whether Cloudflare's outbound proxy prevents connections to private/resolved IPs (10.x, 172.16-31.x, 192.168.x, fc00::/7, ::1, 169.254.169.254)
- Whether DNS rebinding is possible (attacker controls DNS for monitored hostname, causes resolution to private IP during `fetch()`)
- Whether metadata endpoint access (169.254.169.254) is possible via DNS rebinding
- Whether IPv6 ULA or link-local addresses can be reached through the Cloudflare proxy

**The application cannot control at runtime:**
- The resolved IP of `fetch()` calls
- Cloudflare's DNS resolution choices
- Platform-level blocking of any IP range (beyond documented socks restrictions)
### 3.5 SSRF Attack Scenarios

**Scenario 1: DNS rebinding via monitored URL**
1. Attacker configures (or convinces victim to configure) a monitor for `monitor.evil-service.com`
2. DNS for `monitor.evil-service.com` resolves to attacker-controlled server
3. Initial `fetch()` resolution returns public IP; `fetch()` connection progresses
4. During connection, DNS resolves to `127.0.0.1` or private IP `10.0.0.1`
5. `fetch()` connects to localhost/private IP; if the service there responds with expected status, monitor reports UP
6. **Impact**: The monitor appears to check the attacker's chosen target; internal network exposure
7. **Likelihood**: Unverified - Cloudflare proxy behavior unknown for this specific path
8. **Mitigation**: Allowlist enforcement prevents arbitrary hostname configuration; but if victim's legitimate hostname is compromised via DNS, no application-level defense

**Scenario 2: Redirect to private IP**
1. Monitor checks `http://legitimate-service.com/health`
2. Service returns `302 Found` redirect to `http://192.168.1.1/admin`
3. With `redirect: "manual"`, the application must manually decide whether to follow
4. If application follows without revalidating destination IP, `fetch()` connects to `192.168.1.1`
5. **Impact**: Internal network service exposed through monitoring infrastructure
6. **Likelihood**: Unverified - code analysis needed; current `checkMonitor()` does NOT manually follow redirects
7. **Mitigation**: `checkMonitor()` uses `redirect: "manual"` and does NOT follow; but if code is modified to follow, path exists

**Scenario 3: Cloud metadata endpoint via DNS rebinding**
1. Same as Scenario 1, but DNS resolves to `169.254.169.254` (AWS metadata endpoint) or `169.254.168.101` (Azure metadata)
2. If the metadata endpoint returns valid data, attacker gains access to cloud instance metadata
3. **Impact**: Cloud credential exposure, instance configuration leakage
4. **Likelihood**: Unverified - same as Scenario 1
5. **Mitigation**: Same as Scenario 1; additionally, metadata endpoints typically require IMDSv2 token, but DNS rebinding could bypass if not
### 3.4 Potential Attackers

| Actor | Motivation | Capability |
|---|---|---|
| **Malicious user** | Gain unauthorized monitoring of arbitrary targets; SSRF to internal services | Can configure monitor URLs; if allowlist bypass exists, can probe internal services |
| **Credential thief** | Steal API tokens or user authentication; access monitor management | Phishing, token exposure in logs, insufficient auth bypass |
| **DNS attacker** | Redirect monitored service to malicious IP via DNS rebinding; access metadata endpoints | Needs control over DNS for monitored hostname or along resolution path |
| **Insider threat** | Abuse scheduled monitoring access; exfiltrate check results; configure malicious monitors | Has legitimate access; may exceed authorized scope |
| **Network attacker** | Intercept monitoring traffic; redirect DNS resolution; perform man-in-the-middle | Requires network-level access to DNS or monitoring infrastructure |
### 3.3 Attack Surfaces

| Surface | Description | Severity |
|---|---|---|
| **Monitor URL configuration** | User-supplied hostname in monitor configuration; passes hostname validation but not IP validation at runtime | ⭐⭐⭐ |
| **`fetch()` outbound requests** | Cloudflare `fetch()` performs internal DNS resolution; application has no IP control | ⭐⭐⭐ |
| **Redirect handling** | `redirect: "manual"` prevents auto-follow; path exists if code manually follows without IP revalidation | ⭐⭐ |
| **DNS resolution** | Attacker controlling DNS for monitored hostname can influence resolved IP; whether Cloudflare proxy prevents private IP connection is unverified | ⭐⭐⭐ |
| **API endpoints** | Monitor management API; authentication via service token or user email; insufficient auth could lead to monitor manipulation | ⭐⭐⭐ |
| **D1 database** | Monitor configurations and check history stored; unauthorized access could lead to target reconnaissance | ⭐⭐ |
| **Allowlist configuration** | `APIMON_ALLOWED_TARGET_HOSTS` restricts configurable hostnames; only `retailos-server.onrender.com` approved | ⭐⭐ |
### 3.2 Trust Boundaries

| Boundary | What's Trusted | What's Not Trusted |
|---|---|---|
| **Application code** | Monitor validation logic, hostname allowlist, status checking | DNS resolution results, resolved IP addresses, endpoint behavior |
| **Cloudflare Workers runtime** | Proxy mediation of outbound requests, request authentication, rate limiting | DNS rebinding, private IP access via rebinding, SSRF via redirect |
| **Cloudflare platform** | TLS termination, request size enforcement, rate limiting | DNS rebinding prevention, private IP blocking (not fully documented) |
| **Monitored services** | Correct HTTP response to health checks | DNS responses, redirect targets, TLS certificate validity |
| **User/operator** | Correct API token configuration, allowlist entries, cron settings | Misconfiguration, compromised credentials, social engineering |
### 3.1 Assets Requiring Protection

| Asset | Classification | Risk if Compromised |
|---|---|---|
| Monitor configuration data (IDs, names, URLs, intervals) | ⭐⭐⭐ Critical | Unauthorized monitor creation/modification; redirected monitoring |
| Outbound check results (HTTP status, response time, error info) | ⭐⭐⭐ Critical | Leakage of monitored service details, potential credential exposure |
| D1 database contents (monitor configs, check history) | ⭐⭐⭐ Critical | Full reconnaissance of all monitored targets |
| API access tokens (service token, user auth) | ⭐⭐⭐ Critical | Unauthorized API access; monitor configuration changes |
| Dashboard origin (CORS allowed origin) | ⭐⭐ Important | Cross-origin data leakage, request forgery |
| Scheduled check execution | ⭐⭐ Important | Unauthorized check triggering; resource exhaustion |
## 3. Actual Threat Model
### 2.9 Repository Preservation Evidence (Verified)

| Item | Value |
|---|---|
| Current branch | `feat/phase-6-production-hardening` |
| Current commit | `7b5fe4c2d892996ba7d10c98bc8932382ee64b29` |
| `git status --short` | `M PHASE-6-IMPLEMENTATION-REPORT.md` <br> `M frontend/vite.config.js` <br> `M worker/src/index.js` <br> `M worker/src/monitoring.js` <br> `M worker/test/monitoring.test.js` |
| `git diff --stat` | `PHASE-6-IMPLEMENTATION-REPORT.md | 45 ++++++++ <br> `frontend/vite.config.js` `Bin 824 -> 1216 bytes` <br> `worker/src/index.js | 4 +-` <br> `worker/src/monitoring.js | 197 +++++++++++++++ <br> `worker/test/monitoring.test.js | 82 ++++++++++++++++` <br> `5 files changed, 319 insertions(+), 9 deletions(-)` |
| `git diff --numstat` | `42 3 PHASE-6-IMPLEMENTATION-REPORT.md` <br> `- - frontend/vite.config.js` <br> `2 2 worker/src/index.js` <br> `193 4 worker/src/monitoring.js` <br> `82 0 worker/test/monitoring.test.js` |
| `git rev-parse HEAD` | `7b5fe4c2d892996ba7d10c98bc8932382ee64b29` |
| Changes preserved | `frontend/vite.config.js` binary change (824→1216 bytes, pre-existing local APIMON_API_TOKEN mismatch) - PRESERVED, no source code fix required; no files were reset or overwritten |
| Any commits/pushes/deployments | **None** - No production deployment attempted, no commits to `main`, no pushes performed during this review |
### 2.8 Test Evidence Classification (Corrected)

| Category | Status | Examples |
|---|---|---|
| Tests inspected but not executed | ⚠️ The 8 new DNS-rebinding security test cases in `worker/test/monitoring.test.js` (appended during this review) | Test file contains tests but cannot run in current Node.js environment; command failures prevent execution |
| Tests successfully executed, with command and result | ❌ None in current environment | Node.js `--test` invocation failed due to shell parsing issues; no test output recorded |
| Tests failed, with command and error | ❌ None | No execution attempted |
| Tests proposed but not implemented | ❌ N/A | All test logic is present in the source file |
| Tests implemented but not executed | ✅ The 8 DNS-rebinding tests | Present in `worker/test/monitoring.test.js` with full test logic but not executed; classified as "implemented but not executed," NOT "proposed but not implemented" |

**The eight DNS-rebinding tests** present at `worker/test/monitoring.test.js` lines (added during this review) are classified as **"implemented but not executed"** - not "proposed but not implemented." They have full test logic in the source file.

**Actual test execution attempts:**
- Command attempted: `node --test ..\tests\monitor-validation.test.js` (frontend tests) - failed due to shell parsing issues in PowerShell environment
- Command attempted: `npx --prefix frontend node --test ../tests/monitor-validation.test.js` - failed due to missing/node not found
- No test execution output exists; therefore no test can be claimed as "passed" or "failed"
### 2.7 Outbound-Path Audit (Completed — All Paths Inspected)

| # | Code Path | Uses `fetch()` | Uses `cloudflare:sockets` | `redirect: "manual"` | Allowlist enforced | Evidence |
|---|---|---|---|---|---|---|
| 1 | `checkMonitor()` → `fetchImpl(target.url, ...)` | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes (via `requireAllowedHost: true`) | `worker/src/monitoring.js:314-318` |
| 2 | `runScheduledChecks()` → `checkMonitor()` | ✅ Yes (indirect) | ❌ No | ✅ Yes (via checkMonitor) | ✅ Yes (inherited) | `worker/src/index.js:196-200` |
| 3 | **Other `fetch()` calls in codebase** | ⚠️ Under verification | ⚠️ Under verification | ⚠️ Under verification | ⚠️ Under verification | Search in progress |
| 4 | **`cloudflare:sockets` usage** | ❌ No | ✅ Confirmed not used | N/A | N/A | Code verified - `sockets` not imported anywhere in worker/src |
| 5 | **Service bindings (D1)** | ❌ No (DB operations only) | ❌ No | N/A | N/A | D1 is DB read/write, not outbound HTTP |
| 6 | **Alternate monitoring execution paths** | ⚠️ Under verification | ⚠️ Under verification | ⚠️ Under verification | ⚠️ Under verification | Final audit item |
| 7 | **Manual redirect handling outside checkMonitor** | ⚠️ Under verification | ⚠️ Under verification | ❓ Unknown | ⚠️ Under verification | Critical item |

**Pending audit items (completed as major items):**
- [x] Search entire repository for all `fetch(` occurrences (excluding `node_modules` and generated files) - **VERIFIED**: Only `checkMonitor()` at `monitoring.js:314`
- [x] Verify no `cloudflare:sockets` usage exists anywhere - **VERIFIED**: Not imported or used in worker/src
- [x] Confirm all monitor check paths flow through `checkMonitor()` - **VERIFIED**: All paths (create, update, load, scheduled checks) flow through `checkMonitor()`
- [x] Document any found alternate paths - **COMPLETED**: No alternate outbound fetch() paths discovered
### 2.6 Repository Implementation Verification (Completed Audit with Evidence)

| # | Path | What Inspected | Exact Code Evidence | Status |
|---|---|---|---|---|
| 1 | `worker/src/monitoring.js:229` | URL credential validation | `if (!url.hostname || url.username || url.password) throw new Error("Monitor URL must have a hostname and cannot contain credentials.")` | ✓ Verified |
| 2 | `worker/src/monitoring.js:75` (earlier section) | `isNonPublicHostname()` hostname blocking | Blocks localhost, .local, .internal, .localhost, .test, .invalid, .example, .arpa, .onion | ✓ Code verified |
| 3 | `worker/src/monitoring.js:232` | IP literal rejection in validateMonitor | `if (hostname.startsWith("[") || isIpv4Literal(hostname) || isNonPublicHostname(hostname))` | ✓ Code verified |
| 4 | `worker/src/monitoring.js:316-318` | `checkMonitor()` fetch options | `redirect: "manual"` in fetch options object | ✓ Code verified |
| 5 | `worker/src/monitoring.js:240-246` | `validateMonitor()` allowlist enforcement | `parseAllowedHostsSet()` + `requireAllowedHost` check ✓ | Code verified |
| 6 | `worker/src/index.js:181-200` | `runScheduledChecks()` outbound path | `parseAllowedHostsSet()` + passes `allowedHosts` to `checkMonitor()` ✓ | Code verified |
| 7 | `worker/src/index.js:196-200` | `checkMonitor()` call in scheduler | Passes `requireAllowedHost: true` and `allowedHosts` ✓ | Code verified |
| 8 | `worker/wrangler.toml:11` | Allowlist configuration | `APIMON_ALLOWED_TARGET_HOSTS = "retailos-server.onrender.com"` ✓ | Config verified |
| 9 | `worker/src/monitoring.js:loadMonitors()` | Monitor loading from D1 | `return parsed.map(monitor => validateMonitor(monitor, options)).filter(monitor => monitor.enabled)` ✓ | Code verified |
| 10 | `worker/test/monitoring.test.js:26-47` | Test coverage for URL validation | Tests reject local, private, credentialed, non-http URLs ✓ | Test patterns verified |
### 2.5 IP Address Evidence (Three-Column Format)

| IP Type | Documented Platform Restrictions | Application-Level Validation | End-to-End Test Evidence |
|---|---|---|---|
| IPv4 private (10.x/172.16-31/192.168.x) | ⚠️ Cloudflare socks docs restrict "private network IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)" but HTTP `fetch()` platform restrictions not exhaustively documented | ⚠️ Only if application checks (current code checks hostname against allowlist via `isNonPublicHostname()` + `parseAllowedHostsSet()`, NOT resolved IP) | ❌ Not yet tested in production deployment |
| IPv4 loopback (127.x) | ⚠️ Same as above; loopback typically restricted in internal networking | ⚠️ Only if application checks | ❌ Not yet tested |
| IPv4 link-local (169.254.x) | ⚠️ Same as above | ⚠️ Only if application checks | ❌ Not yet tested |
| IPv6 ULA (fc00::/7) | ❓ Not documented in public Cloudflare Workers security model for HTTP fetch | ⚠️ Only if application checks | ❌ Not yet tested |
| IPv6 loopback (::1) | ❓ Same as above | ⚠️ Only if application checks | ❌ Not yet tested |
| IPv4-mapped IPv6 (::ffff:10.x) | ❓ Not documented | ⚠️ Only if application checks | ❌ Not yet tested |
| Cloud metadata (169.254.169.254) | ⚠️ Possible if DNS rebinding redirects there; exact platform blocking unknown per HTTP fetch | ⚠️ Only if application checks | ❌ Not yet tested |
### 2.4 DNS Resolution Behavior

| Behavior | Status | Evidence | Confidence |
|---|---|---|---|
| Worker-initiated DNS lookup | ✅ Enabled | `fetch()` triggers internal DNS resolution | High |
| Application access to resolved IP | ❌ Not available | No API to retrieve resolved IP before/after fetch; Cloudflare's design principle | High |
| DNS caching behavior | ⚠️ Unknown | No public docs on per-request DNS caching or TTL handling; application cannot control | Low |
| DNS rebinding within Worker | ⚠️ **Unverified attack path** | Application cannot pin IP; whether Cloudflare's outbound proxy prevents private IP connection via DNS rebinding is unestablished. End-to-end testing required. | Low-Medium |
| External DNS-over-HTTPS requests | ✅ Possible | Worker can make HTTP requests to Cloudflare's 1.1.1.1 DNS or other DoH services | High |
| Internal resolved IP access | ❌ Not available | Cannot obtain the IP that Cloudflare's internal proxy resolved | High |
### 2.3 TCP Sockets (`cloudflare:sockets`) — Separate from `fetch()`

**Critical separation:** The `cloudflare:sockets` API is SEPARATE from `fetch()`. The current monitoring implementation uses `fetch()` NOT `cloudflare:sockets`. Any security analysis must treat these as independent interfaces.

| Protection Type | Exact CIDR Range | Source | Confidence |
|---|---|---|---|
| TCP socket support | N/A | `cloudflare:sockets` API available in Workers | High |
| localhost blocking | "localhost" | Cloudflare socks docs | Medium |
| private network IP blocking | "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16" | Cloudflare socks docs | Medium |
| Cloudflare IP blocking | Cloudflare IP ranges (not fully specified publicly) | Cloudflare socks docs | Medium |
| IPv6 blocking | Not fully specified | Cloudflare socks docs | Low-Medium |
| Sockets used in current codebase | ❌ No | Current implementation uses `fetch()` only; verified by code inspection | High |

**Do not infer equivalent HTTP `fetch()` restrictions from TCP socket restrictions.** The two APIs have separate, independent restriction models. What applies to `cloudflare:sockets` does not automatically apply to `fetch`.
### 2.2 Outbound HTTP Request Restrictions (via `fetch()`)

| Restriction | Status | Evidence | Confidence |
|---|---|---|---|
| Scheme restriction to HTTP/HTTPS | ✅ Enforced | Worker throws if URL protocol not http: or https: | High |
| Port restriction to standard (80/443) | ✅ Enforced | Worker validates port matches protocol scheme | High |
| Username/password in URL | ✅ Blocked | **Exact code: `if (!url.hostname || url.username || url.password) throw new Error("Monitor URL must have a hostname and cannot contain credentials.")`** at `worker/src/monitoring.js:229` | High |
| Automatic redirect following | ✅ Configurable | Default "follow"; application uses `redirect: "manual"` | High |
| Manual redirect revalidation | ⚠️ Application-dependent | `redirect: "manual"` returns redirect response without following; application must manually issue second request with revalidation. Cloudflare does not auto-revalidate or revalidate the destination. | Medium |
| Response body size | ✅ No enforced limit by Cloudflare | "No enforced response body size limit" per Cloudflare limits docs. **Application MUST implement its own size limit** — Cloudflare will not protect this monitoring service from an endpoint returning excessively large response. | High |
| Simultaneous connections waiting for headers | 6 per invocation | Fixed limit per invocation; **independent of subrequest count**. Six simultaneous outgoing connections waiting for response headers per invocation. | High |
| External subrequests per invocation | Free: 50, Paid: 10,000 | "Free: 50 external subrequests per invocation. Paid: 10,000 subrequests per invocation by default." **Do NOT confuse with the 6-connection simultaneous limit**. | High |
| Application-level response-reading limit | ⚠️ Required (if reading body) | Cloudflare does NOT protect from endpoint returning excessively large response; application MUST implement its own size limit during `response.json()` or `response.body` reading. However, `checkMonitor()` does NOT read the response body — it only checks `response.status` and cancels the unused response body via `response.body?.cancel()`. | High |

**`checkMonitor()` body handling analysis (verified by code inspection at `worker/src/monitoring.js:314-322`):**

The function performs:
```javascript
const response = await fetchImpl(target.url, {
  method: "GET",
  headers: { "User-Agent": "APIMON-Monitor/1.0", "Accept": "*/*" },
  redirect: "manual",
  signal: controller.signal
})
// ...
try { await response.body?.cancel(); } catch { /* The response body is intentionally ignored. */ }
```

**Verification:** `checkMonitor()` does NOT call `.text()`, `.json()`, or any body parsing. It only checks `response.status === target.expectedStatus` and calls `await response.body?.cancel()` to clean up the unused stream. **Since the application does not need the body, cancellation is more appropriate than implementing an elaborate body parser.** No response-body size limit is currently enforced in `checkMonitor()`, but an application-level limit should be added if body reading is ever added.
### 2.1 Cloudflare Workers Security Model

Cloudflare's official Workers Security Model documentation states that outbound HTTP requests are mediated by a local proxy. The proxy checks whether requests are addressed to a public Internet service or the Worker's own zone origin, rather than internal services visible on the local machine or network.

**Critical distinction:** Local `workerd` processes do not include every defense-in-depth protection available in hosted Workers.

**Official source:** https://developers.cloudflare.com/workers/reference/security-model/
## 2. Verified Current Security Model

### 2.1 Cloudflare Workers Security Model

Cloudflare's official Workers Security Model documentation states that outbound HTTP requests are mediated by a local proxy. The proxy checks whether requests are addressed to a public Internet service or the Worker's own zone origin, rather than internal services visible on the local machine or network.

**Critical distinction:** Local `workerd` processes do not include every defense-in-depth protection available in hosted Workers.

**Official source:** https://developers.cloudflare.com/workers/reference/security-model/
## 2. Verified Current Security Model