# AssetTrust v0.41 handover

**Starting point:** v0.40 Shared Recipient Access Hardening. **New release:** v0.41 CI and release validation checkpoint.

**New source:** `tools/ci-completeness-v41.cjs`, `tools/release-readiness-v41.cjs`, `tools/two-client-policy-v41.cjs`, `tools/e2e-pg-shared-counter-v41.mjs`, `tools/tests-v41/ci-gates.test.cjs`; `package.json` and `.github/workflows/ci.yml` updated.

**Evidence:** `TEST_EVIDENCE_V41.md` plus individual logs in `test-evidence/v41/`. All 39 offline version-check commands v0.03–v0.41 passed, 9 new tests passed, architecture and source syntax checks passed, and unchanged 18 migration fingerprints match. Clean npm install/build blocked on missing lockfile and dependencies. Live PostgreSQL test has been authored but not executed. No new migrations, encryption key changes or data transformations.

**Why:** Earlier CI silently omitted v0.36–v0.40 tests. The new guard prevents that drift from recurring and prepares a guarded multi-client DB contention check.

**Next operator task:** On a trusted connected Kali box, generate and review authentic npm lock, `npm ci`, run the full build, provision a disposable PostGIS database, run all live SQL contracts, two-NestJS-instance HTTP and browser E2E journeys, then complete deployment security/privacy review. `V41_KALI_VALIDATION.md` is the authoritative operator sequence.

**Release decision:** **BLOCKED FOR PRODUCTION.** A green offline CI suite is not approval for real land/customer evidence.
