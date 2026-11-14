# AssetTrust v0.81 — Engineering Handover

**Date:** 12 November 2026  
**Base:** v0.80 full-source checkpoint  
**Result:** fail-closed startup and test-instance isolation implemented, source/offline verification successful; **production NO-GO**.

## Engineering change

The previous `validateRuntimeConfig()` required an independent `LOGIN_ABUSE_PEPPER` only in production, while `LoginAbuseService` required it in *every* environment. Therefore local instances could start, pass readiness, and then fail all login attempts with a 503. The startup validator now checks key presence, structure, and separation from other security keys regardless of `NODE_ENV`.

The API listener previously parsed the port with `Number(process.env.PORT||4000)` and enabled CORS from an untrimmed, fallback-containing `WEB_ORIGIN.split(',')`, diverging from the configuration policy. The listener now uses three shared pure domain helpers in `apps/api/src/contexts/platform/domain/runtime-config.ts`:

- `apiListenPort()` rejects zero, negative, fractional, oversized and nonnumeric ports before `app.listen`;
- `allowedWebOrigins()` verifies and returns the normalized exact CORS allowlist (HTTPS only in production);
- `apiListenHost()` ensures all test-mode services bind to `127.0.0.1`, regardless of host overrides.

The validator blocks non-test E2E identity markers, unsafe markers, mismatched expected markers, and test-write authorization outside an owned test instance. Explicit public-interface binding is rejected for test mode even though the listener independently forces loopback. Development LAN binding remains available *only* for non-E2E application development.

The existing NestJS guards, domain-driven architecture, audit logging, 27 migrations and the 13 FORCE-RLS tables / 16-policy source contract remain unchanged. No payment collection or banking implementation is implied by this milestone.

## Verified in this authoring container

| Check | Status |
|---|---|
| New `npm run verify:v81` | PASS: 35/35 tests |
| Version-suite regressions v41–v81 | PASS: 41/41 suites, 770 TAP test cases, zero failures |
| `npm run verify:architecture` | PASS |
| `npm run verify:syntax` | PASS (syntax only, not semantic TypeScript build) |
| `npm run build:source:v56` | PASS |
| `npm run build:imports:v80` | PASS |
| `npm run verify:ci:v53` | PASS |
| `npm run security:scan:v43` | PASS, high-confidence patterns only; zero matches in 3,541 files **before final handover documents** |
| SQL migrations | 27 original files unchanged |
| Authentic npm lockfile | **MISSING** |
| `npm ping` | **FAIL: EAI_AGAIN registry.npmjs.org** |
| `npm run build` | **FAIL: cannot resolve uninstalled Node/NestJS/Express/pg types and packages** |
| `npm run release:preflight:v51` | **BLOCKED** by missing genuine lockfile |
| PostgreSQL, PostGIS, ClamAV, HTTP, browser, two-API and deployment tests | **NOT EXECUTED HERE** |
| Git full-history scan and independent security sign-off | **NOT EXECUTED HERE** |
| Production release | **NO-GO** |

Old v43 test was updated to verify both the listener's shared bind policy and the policy module's explicit production loopback and test loopback requirements. That is a stricter behavioral contract than the obsolete inline-string assertion. No access-control assertions were removed.

## Next engineering priority

On trusted connected Kali, acquire/review a genuine lockfile, install packages, run `npm run build`, and record the **first actual TypeScript compile failure**. Only then repair genuine dependency-backed compilation errors and execute the preexisting disposable PostGIS/ClamAV integration and authenticated operational acceptance runners. Do not generate fake package locks, bypass dependency audits, or promote offline source checks to production approval.

See `V81_KALI_VALIDATION.md` for commands and safety boundaries.
