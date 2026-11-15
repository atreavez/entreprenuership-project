# AssetTrust v0.55 - Executed test evidence

**Environment:** isolated runner; Node 22.16.0, npm 10.9.2, TypeScript globally available. No installed workspace dependencies, genuine package lockfile, PostgreSQL, ClamAV or original Git history. Network DNS to npm registry unavailable.

| Gate | Result | Evidence |
|---|---|---|
| v0.55 new tests | PASS 16/16 | `test-evidence/v55/verify-v55.log` |
| All historic and current versions v03-v55 | PASS 53/53 | `test-evidence/v55/versions-*.json` and `verify-v*.log` |
| CI YAML + semantic policy | PASS | `test-evidence/v55/ci-v53.log` |
| CI suite completeness | PASS | `test-evidence/v55/ci-v41.log` |
| Architecture guard | PASS | `test-evidence/v55/architecture.log` |
| TypeScript transpile-only syntax | PASS 104 files | `test-evidence/v55/syntax.log` |
| Offline domain smoke | PASS | `test-evidence/v55/smoke-offline.log` |
| SQL migration fingerprints | PASS 25/25 identical to v0.54 | `test-evidence/v55/migration-fingerprints.json` |
| Current-source secret scan | PASS (limited) 2317 files; no high-confidence matches | `test-evidence/v55/source-secret-scan.log` |
| Read-only lockfile verification | BLOCKED expected; no real lockfile | `test-evidence/v55/lockfile-check-blocked.log` |
| Real lockfile generation attempt | TIMEOUT / NO LOCKFILE | `test-evidence/v55/real-lockfile-generation-attempt.log` |
| `npm ci --offline` | BLOCKED | `test-evidence/v55/npm-ci-offline-blocked.log` |
| Full API and web build | BLOCKED missing dependencies | `test-evidence/v55/build-blocked.log` |
| Live ClamAV scanner | BLOCKED unavailable | `test-evidence/v55/clamav-live-blocked.log` |
| Full Git history (on ZIP) | BLOCKED missing `.git`; external clone supported | `test-evidence/v55/git-history-zip-blocked.log` |
| Supervised evidence completeness | BLOCKED missing complete run | `test-evidence/v55/evidence-review-blocked.log` |
| v0.41 release preflight | BLOCKED 3/11 prerequisites | `test-evidence/v55/release-preflight-11-blocked.log` |

All recorded failures are release blockers, not passes. The synthetic npm runner tests do not prove genuine lockfile creation. No actual production secrets were collected or changed. No SQL migration was applied. Production release remains **NO-GO**.
