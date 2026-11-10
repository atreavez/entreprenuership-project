# AssetTrust v0.17 — Test evidence and release decision

**Scope:** test-first offline integrity and architecture safeguards; original production behavior is unverified.

| Check | Result | Evidence |
| --- | --- | --- |
| RED before validator implementation | Expected failure (missing module) | `test-evidence/v17/red-v17.log` |
| v0.17 tests after implementation | 14 passing, zero failures | `test-evidence/v17/verify_v17.log` |
| Legacy v0.3–v0.16 offline suites | Commands returned exit 0 | command logs and local execution; representative v0.10–v0.16 logs included |
| Global architecture check | Passed in v0.17 tests, 14 domain/application TS files scanned | `tools/tests-v17/clean-architecture.test.cjs` |
| Source syntax | 54 TS/TSX files, zero syntax diagnostics | `test-evidence/v17/verify_syntax.log` |
| Full API/Web build | **Failed**, API TS2688 missing `@types/node` | `test-evidence/v17/build-v17.log` |
| `npm ci --offline` | **Failed**, missing generated lockfile | `test-evidence/v17/npm-ci-v17.log` |
| Strict release gate | **Correctly failed**, missing lockfile | `test-evidence/v17/release-gate.log` |
| Actual live PostgreSQL/PostGIS + browser | **Not executed** | no runtime evidence |
| GitHub Actions execution | **Not executed here** | CI workflow changed, not run |

The attempted registry query returned `EAI_AGAIN`. No package-lock file was manufactured. Offline test success does **not** imply that NestJS controllers, React, SQL migrations, or the full system work together.

**Release decision: BLOCKED.** Next action: generate an authentic lockfile and run a connected `npm ci`, full builds, and disposable live integration tests on Kali Linux or a connected CI runner.
