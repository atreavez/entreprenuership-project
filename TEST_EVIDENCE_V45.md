# AssetTrust v0.45 - Evidence Log

Date: 11 November 2026. Source baseline: v0.44.

| Check | Actual result | Supporting file |
|---|---|---|
| New v0.45 tests | PASS 11/11 | `test-evidence/v45/verify_v45.log` |
| Offline version suites v0.03-v0.45 | PASS 43/43 | `test-evidence/v45/verify_v03.log`...`verify_v45.log` |
| Version suites + architecture + source syntax + CI checks + scan | PASS 47/47 | `test-evidence/v45/manifest.json` |
| Architecture | PASS | `test-evidence/v45/verify_architecture.log` |
| TypeScript source syntax transpilation | PASS 100 files / 0 diagnostics | `test-evidence/v45/verify_syntax.log` |
| CI script coverage | PASS, 43 versions and 19 PostgreSQL contract scripts declared | `test-evidence/v45/verify_ci_v41.log` |
| Migration SHA-256 source manifest | PASS 20/20 | `apps/api/src/contexts/platform/domain/schema-manifest.ts` vs SQL bytes; checked with `verify:v11` |
| Working-tree limited-pattern secret scan | PASS 1,619 files, 0 high-confidence matches | `test-evidence/v45/security_scan_v43.log` |
| Read-only release preflight | BLOCKED as expected | `test-evidence/v45/release-preflight.json` |
| Full build | FAIL: missing installed dependencies, Node types, genuine lockfile | `test-evidence/v45/build-attempt.log` |
| Disposable PostgreSQL test | NOT RUN: guard rejected unapproved environment before DB import | `test-evidence/v45/pg-guard.log` |
| Git history secrets scan | NOT RUN: checkpoint has no `.git` history | Requires canonical Git repository |
| Browser/TLS/SSH/malware/security audit | NOT RUN | Requires local/staging infrastructure and provider access |

The 11 new tests are primarily policy, transpiled-controller, mocked-query and source/CI contract tests. They do not prove that the real PostgreSQL row lock or multi-API deployment works under contention. The `test:pg:login-abuse:v45` runner is implemented but was not executed against a real database here.

No high-confidence source pattern match is **not** evidence that no secret exists. Do not report npm audit, live RLS, production firewall, credential rotations or full Git-history scanning as completed. **Release decision: NO-GO.**
