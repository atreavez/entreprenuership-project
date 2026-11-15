# AssetTrust v0.61 — Test evidence

Date: 11 November 2026. Source: exact `assettrust-v61` checkpoint. **Release result: NO-GO.**

## A. Executed and passed

| Check | Result | Evidence |
|---|---|---|
| v0.61 dynamic policy and service tests | **16/16 PASS** | `npm run verify:v61`, `tools/tests-v61/audit-rls-v61.test.cjs` |
| Historical + current version suites v0.03–v0.61 | **59/59 PASS across recorded runs** | `test-evidence/v61/version-matrix.json`, and 59 individual logs under `test-evidence/v61/version-logs/` |
| YAML/CI security contract | PASS | `npm run verify:ci:v53` (`v61-ci-check.log` captured during creation) |
| CI suite coverage | PASS | `npm run verify:ci:v41` |
| Domain architecture checks | PASS | `npm run verify:architecture` |
| TypeScript/TSX syntax/transpilation scan | PASS | `npm run verify:syntax`; 104 source files, zero syntax diagnostics. **Not a full typecheck.** |
| Offline domain smoke | PASS | `npm run smoke:offline` |
| Current-source high-confidence secret scan | PASS | `npm run security:scan:v43`; 2,787 files, zero high-confidence matches; **not Git-history coverage** |
| SQL migration integrity | **26/26 SHA-256 fingerprints match** | `tools/migrations/plan.cjs` plus `schema-manifest.ts`; 001–025 byte-identical to v0.60 |
| Supervised database test plan | PLAN-ONLY PASS | `npm run release:plan:v51`; includes v0.61 audit RLS after restricted-role privilege check |
| Unsafe live invocation denied | PASS AS SAFETY GATE | `npm run test:pg:audit-rls:v61` with incomplete consent: BLOCKED before `pg` import or connection |

Initial history run passed 57 suites and failed two *stale static expectations* (v0.57 expected seven rather than eight RLS tables; v0.60 expected the old workspace version). The expectations were updated to test the expanded inventory and compatible later versions; both affected suites were rerun and passed. All 59 PASS logs, including the two rerun logs, are retained.

## B. Executed and blocked or failed (do not count as passes)

| Check | Result | Explanation |
|---|---|---|
| `npm ci --offline` | FAIL | Authentic `package-lock.json` absent. No fake lockfile created. |
| `npm run build` | FAIL | `@nestjs/*`, `pg`, Node type declarations and other installed packages unavailable. Compilation was **not** successful. |
| `npm run release:preflight:v51` | BLOCKED | Lockfile missing; correct fail-closed behavior. |
| `npm run test:pg:audit-rls:v61` | NOT RUN LIVE | The incomplete/unsafe invocation was rejected before a database connection. No PostgreSQL service/approved credentials available here. |

## C. Not executed / not independently verified

- Live PostgreSQL application of migration 026 and seeded two-organization role/RLS test.
- Real restricted runtime database role permissions in PostgreSQL; full HTTP, two-API and browser integrations.
- Authentic npm registry install, dependency vulnerability audit, full API and Vite builds, deployment artifact scan.
- Real ClamAV service clean/malicious verdict tests, TLS/HSTS, restore-tested backup and production deployment.
- Original Git repository history secret scan, source dependency SBOM and independent penetration test.

## D. Release and scope assessment

The migration is source-reviewed and offline-tested; it is **not** empirically validated against a live PostgreSQL server. Eight named tables have RLS policies in source: `audit_events`, `assets`, `verification_cases`, `case_evidence`, `documents`, and three PDF-layout tables. Many other sensitive tables remain unprotected at the database RLS layer. Transaction-scoped RLS does not replace parameterized SQL, authorization or a least-privilege database role. Local audit hashes are not independent blockchain anchors.

**Production verdict: NO-GO; no real customer records or commercial transactions.**
