# AssetTrust v0.69 — Authenticated Administration and Tenant-Control Acceptance

**Date:** 12 November 2026  
**Version:** `0.69.0`  
**Base:** v0.68 Build Acceptance and Artifact Provenance  
**Classification:** source + executable offline security tests + *live* test harness; **NOT a live database certification or production release**.

## Milestone purpose

The v0.68 build gate proves, once run on a connected trusted computer, that the real dependencies and compiled artifacts are valid. v0.69 adds a separate behavior gate: the *running API*, using a **restricted, non-owner PostgreSQL role**, must reject users attempting to exceed organization or administrator authority, even if health/readiness checks pass.

## Actual implementation

1. `tools/e2e-authenticated-control-v69.mjs` implements the guarded integration journey against an already-started, *owned* `127.0.0.1` disposable API. It requires `CI=true`, `NODE_ENV=test`, explicit mutation consent, the separately reviewed `assettrust_v57_ci_runtime` role, matching operator/runtime disposable DB URLs, a unique API-owned marker and explicit v69 opt-in. It validates the API health identity, exact source version, 27 verified migrations, 16 RLS policies and 13 protected tables **before the first fixture write**.
2. The journey creates two independent synthetic organizations, verifies that their administrators can read their own configuration but cannot access global Platform Super Admin controls, creates a tenant A asset and confirms tenant B cannot view/discover it, and invites an ordinary reviewer. It checks that the reviewer cannot access administrator configuration or an unassigned asset. **Privileged configuration changes and co-admin invitations must fail without a current MFA step-up.** Finally it revokes the reviewer's session and demands a 401 for the old access token.
3. `tools/ci-live-integration.mjs` runs the new v69 integration suite first as one of five suites against its **own randomly marked, supervised real API child process**, then runs the earlier suites. It introduces deliberate 65-second pacing between suites to honor actual authentication rate-limit windows instead of bypassing them.
4. `tools/tests-v69/authenticated-control-v69.test.cjs` provides 22 dependency-free offline tests covering target rejection, authorization, role/tenant boundaries, live acceptance call ordering (with simulated responses), token revocation, privacy of evidence and CI wiring. These are **simulated HTTP** tests, **not real PostgreSQL executions**.
5. `.github/workflows/ci.yml` adds `npm run verify:v69` to the existing post-install unit checks. The supervised HTTP suite runs later after PostgreSQL migrations, restricted role provisioning, build and readiness gates.
6. Package versions and npm scripts are updated to `0.69.0`. `README.md` begins with an accurate latest-checkpoint banner. The v0.68 regression version fixture now checks cross-workspace consistency while v0.69 separately pins the new version.

There are **no new database migrations**, changed RLS policies, changed API routes, bypassed MFA requirements, changed domain features, or privilege escalations. The 27 pinned migrations remain unchanged.

## Offline evidence — verified in this execution environment

- **22/22** v0.69 unit/simulated tests pass.
- **67/67** historical and current version scripts `verify:v03`–`verify:v69` exited successfully; across those logs, **1,015 passing test cases were explicitly counted** (`verify:v03` uses a non-TAP format and is counted as a passing command only). v0.03–v0.22 passed in a batch, v0.23 passed separately after the first long batch was interrupted, v0.24–v0.40 and v0.41–v0.69 passed in batches, and v0.69 was rerun after final edits. This is *not* 67 live E2E suites.
- `verify:architecture`, `verify:syntax`, `build:source:v56`, `verify:ci:v53`: PASS. CI contract recognized 67 version suites and 31 PostgreSQL contract scripts.
- `security:scan:v43`: PASS against **3,085 current-source files**, zero high-confidence matches; does not scan the original Git history.
- Unauthorized v0.69 live invocation correctly returned non-zero and refused to contact an API.
- `build:acceptance:inspect:v68`: BLOCKED on missing authentic lockfile (source integrity checks passed).
- `release:preflight:v51`: BLOCKED on missing authentic lockfile.
- `npm run build`: FAILED because dependencies were not installed (`@nestjs/common`, `pg`, `@types/node` and other types). This does not establish that source compiles once authentic dependencies are installed.
- External npm registry access failed with `EAI_AGAIN`; no fabricated lockfile was committed.

## Acceptance and release blockers

**NO-GO** until successful `npm ci`, vulnerability audit, API + React compilation, artifact provenance checks, real PostgreSQL/PostGIS integration, real v69 HTTP acceptance evidence from a supervised test API, full source and original Git-history credential checks, ClamAV upload verdicts, real browser flows, MFA control verification, backup/restore, HTTPS/reverse-proxy and host-security review, tenant isolation adversarial checks and a signed human release decision.

Passing a v69 local HTTP test reports `AUTHENTICATED_ACCEPTANCE_PASSED_RELEASE_BLOCKED`, **never** `productionApproved: true`. Synthetic test records remain in the disposable database and must be disposed of by destroying the database fixture; never reuse it as production data.

## Next engineering priority

**v0.70 — Actual Kali Integration Remediation**: use `V69_KALI_VALIDATION.md`, fix the **first genuine npm/build or restricted-role live test failure**, then rerun the full supervised API, PostgreSQL, and browser journey. Do not create another source-only security layer as a substitute for these runtime results.
