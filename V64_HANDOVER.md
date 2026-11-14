# AssetTrust v0.64 — Runtime integration evidence checkpoint

**Date:** 11 November 2026  
**Base:** Exact source archive `AssetTrust_v63_RLS_Policy_Integrity_Checkpoint.zip`  
**Decision:** **ENGINEERING CHECKPOINT ONLY — PRODUCTION NO-GO**.

## What this milestone delivers

This version adds a guarded and repeatable way to obtain real integration evidence from the trusted Kali workstation. It **does not falsely claim** that the API, web interface, database, and external services were successfully run in this offline environment.

- `tools/integration-evidence-v64.cjs` is a no-external-dependency orchestration tool with `--plan`, `--inspect`, `--build`, `--database`, `--all`.
- `--build` delegates to the existing complete v0.51 supervised supply-chain, test, ClamAV, compilation and Git-history process. It refuses to start without an authentic lockfile.
- `--database` delegates to the existing supervised migration, PostgreSQL, cross-tenant/recipient and two-API process **only** if both builds exist, URLs are local and disposable, operator and non-owner runtime DB logins differ, **all existing v51-v63 confirmations pass**, and a new v64 exact-database-name confirmation is present.
- `--all` runs the build stage first, then independently authorizes database mutation; failure stops immediately.
- The runner stores a restrictive-permission (`0600`) summary in `test-evidence/v64/integration-summary.json`, with a deliberately limited, redacted failure excerpt. **Inspect the excerpt again before sharing**. It cannot grant production approval.
- `tools/tests-v64/integration-evidence-v64.test.cjs` tests denial cases, no-spawn preflight failures, sensitive value redaction, repeatable evidence, and link attacks.
- `verify:v64`, dedicated `integration:*:v64` commands, workspace versions and CI coverage were updated.
- v0.63 version consistency test was made forward-compatible for 0.63+ while preserving its 27-migration immutability check.

## Invariants preserved

DDD/SOLID/Clean Architecture/TDD/security-by-design; immutable SQL migration history (no new migration in this milestone); global Platform Super Admin vs. scoped Organization Admin permission boundaries; least-privilege runtime database role; 13-table RLS catalogue/16 approved policies; application authorization, auditable two-person approvals, evidence integrity, restricted uploads, payment correctness and privacy. This milestone modifies **no** RLS policies, admin permissions, payment rules, cryptographic signing or application business logic.

## What remains genuinely unverified

- Real npm-registry lockfile creation and review, `npm ci`, vulnerability audit, full API/web build and unit tests in a connected environment.
- Disposable PostGIS-backed migrations, two-organization negative tests, receipt/report issuance, restricted-role queries and browser E2E.
- ClamAV against live scanner, original Git history secret search, provider/payment sandbox, authenticated admin and citizen/browser flows, encrypted backups/restore, HTTPS/TLS, MFA enforcement, secure SSH exposure review, incident response and independent penetration/legal checks.

Do not enable production money movement, document issuance or public access based on these offline results. The next milestone is **v0.65: First failing live Kali build/integration fix and real acceptance evidence**, not another source-only security claim. Follow `V64_KALI_VALIDATION.md` and preserve the first failing command and its *redacted* output.
