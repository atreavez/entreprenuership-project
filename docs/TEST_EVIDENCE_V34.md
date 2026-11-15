# AssetTrust v0.34 — Test Evidence and Release Decision

**Compiled by Aturinzire Hargreave.** Data from code/test runs in the artifact-generation environment. See retained logs under `test-evidence/v34/`.

## Verified offline checks

| Verification | Result | Evidence |
|---|---|---|
| New v0.34 tests, policy + service + migration | **28/28 PASS** | `test-evidence/v34/verify-v34.log` |
| Offline version-suite commands v0.3–v0.34 | **32/32 PASS** | `test-evidence/v34/verify-v03.log` … `verify-v34.log` |
| Architecture suite | **PASS** | `test-evidence/v34/architecture.log` |
| TypeScript/TSX syntax scan | **PASS, 82 files / 0 syntax diagnostics** | `test-evidence/v34/syntax.log` |
| Total successful offline verification commands | **34/34 PASS** | `regressions-part1.json`, `regressions-part2.json` |
| SQL migration manifest consistency | **14/14 byte-for-byte fingerprint matches** | Scripted SHA-256 verification of committed manifest vs migration files |
| CI YAML parsing | **PASS** | PyYAML parser, `jobs` key verified |
| Source-based desktop/mobile UI previews | **PASS** at 1440px and 390px | `screenshots/v34-*.png` |
| DOM horizontal-overflow checks | **PASS** for issuance and public verification | Playwright `document.documentElement.scrollWidth <= viewportWidth` |
| ZIP integrity | **PASS** | ZIP CRC verified during packaging |

### Test-first evidence

Initial domain test run: **7 failures** against the not-yet-created report domain module (`test-evidence/v34/red-policy-initial.log`). The domain module was implemented and tests moved to GREEN. The service tests later detected a mismatch between the internal database field `snapshot_sha256` and the public formatter field; the correction was validated by rerunning the full new test suite. This is test-first evidence, **not** a live database test.

New tests cover: closed-case and six-stage independent evidence requirements; disputes; safe wording and immutable legal notice; deterministic canonical serialization; unguessable UUID reference format; proposal state; independent approval; tenant boundaries; current MFA; current proposer status; changed case/template snapshots; explicit supersession; tamper flags; dispute-induced public UNDER_REVIEW; SQL constraints; QR generation origin; no private data in public results.

## Unresolved gates — do NOT claim these passed

| Gate | Observed result |
|---|---|
| Authentic npm lockfile | **FAILED / MISSING:** `release:gate:v17` exits nonzero; see `release-gate.log` |
| Full API and React build | **FAILED:** Node typings, NestJS and other dependencies unavailable in the environment; see `build.log` |
| Real PostgreSQL and PostGIS | **NOT EXECUTED:** no live server available here |
| New report SQL contract test | **NOT EXECUTED:** `test:pg:reports:v34` rejects execution without explicit disposable-data authorization, as intended; see `postgres-refusal.log` |
| Real QR React runtime | **NOT EXECUTED:** source-based preview only; actual React dependency needs `npm ci` |
| Browser end-to-end workflow | **NOT EXECUTED** |
| Emergency report withdrawal, signed PDF, external signature/anchor and government registry integration | **NOT IMPLEMENTED** |

## Caveats

`verify:syntax` uses TypeScript transpilation and is not a complete typecheck or production build. Offline service tests use controlled database substitutes; they cannot establish PostgreSQL query correctness, trigger behavior or transactional isolation in a running database. A SQL test script is included for an explicitly authorized disposable localhost database, and CI is configured to run it once dependencies and the database are available. The four preview PNGs derive from actual React TSX/CSS but use fictional fixtures and a **locally generated demonstration QR**; they are not screenshots of a live deployment.

**Release decision: BLOCKED. DEVELOPMENT CHECKPOINT ONLY.** Before production: real lockfile, successful build, migration and contract tests, current-session MFA HTTP tests, privacy/security review, browser verification, emergency withdrawal governance, and independent archival/signature design.
