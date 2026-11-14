# AssetTrust v0.66 — Security Report

**Decision: PRODUCTION NO-GO**  
**Date:** 11 November 2026  
**Assessment:** offline source changes and simulated/live-local-HTTP unit verification, NOT an independent external audit.

## Remediated control gap

A previously healthy running NestJS API could continue returning `/readyz=200` after a PostgreSQL administrator changed an RLS policy. Previously reviewed startup rules detected drift only on restart. v0.66 invokes the full reviewed runtime role, ownership, FORCE RLS and 16-policy catalog check **on every readiness request** after validating PostGIS and the pinned 27-migration ledger. A drift causes non-ready status, so orchestrators can remove the instance from traffic based on that signal. No destructive database action is added.

The UI requires the new explicit `security` contract field before displaying READY, separately shows 16 policies / 13 tables, and does not infer production authorization from infrastructure health. A two-API test runner verifies identity markers and consistent live response fields across independent local processes, rejecting redirects and stale versions.

## Test evidence and limitations

- New code-level v0.66 suite: 25 PASS / 0 FAIL (includes transpiled actual policy + probe code and temporary Node HTTP servers).
- v0.54–v0.66 regression suites: 13 PASS / 0 FAIL, 237 test case executions.
- Architecture, TS/TSX transpilation, source entry/imports, and YAML semantic policy checks PASS.
- Full TypeScript typecheck, actual NestJS/Vite builds, live PostGIS policy inspection and full authenticated browser flows **NOT VERIFIED**. Dependencies and lockfile are unavailable. CI has not been run by GitHub Actions in this environment.
- The original Git history is absent from the source ZIP, so retained-secret scanning and rotation evidence remains missing. ClamAV malware scanning, penetration testing, TLS, production infrastructure restrictions, provider/payment review and backup/restore testing are likewise outstanding.

## Security notes

Repeated PostgreSQL catalog queries add measurable overhead. In staging, load-test readiness polling and right-size liveness/readiness intervals. Keep `/healthz` lightweight for basic process liveness and `/readyz` for stronger policy assurance. A successful query reflects a snapshot at probe time only; administrator changes after a check, race conditions, and other tables outside the 13 protected tables remain separate security review concerns.

The v0.66 test checker makes **no production approval assertion**, never sends credentials, never follows HTTP redirects, and never accepts remote URLs. All security evidence files should be reviewed for secret exposure before sharing. Maintain the complete previously approved release gate and do not deploy with a bypass.
