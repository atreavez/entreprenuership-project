# AssetTrust v0.43 - Verification evidence

**Date:** 11 November 2026. **Target:** extracted AssetTrust v0.42 source modified to v0.43. **Verdict:** Offline checks passed; production release NO-GO.

| Test | Result | Recorded evidence |
|---|---|---|
| `npm run verify:v43` | PASS 8/8 | `test-evidence/v43/verify-v43.log`, `new-security-tests.log` |
| `npm run verify:v03` to `verify:v43` | PASS 41/41 | `test-evidence/v43/regression-results.json` and version-specific logs |
| `npm run verify:architecture` | PASS | `test-evidence/v43/architecture.log` |
| `npm run verify:syntax` | PASS, 93 source files | `test-evidence/v43/syntax.log` |
| `npm run security:scan:v43` | PASS, zero high-confidence source matches | `test-evidence/v43/high-confidence-source-scan.log`. More than 1,500 inspected source/text files. |
| `npm run security:scan:v43 -- --history` | BLOCKED as required | No `.git` metadata; scanner failed closed |
| `npm ci --offline --ignore-scripts --dry-run` | BLOCKED | No authentic lockfile |
| `npm audit --offline --omit=dev --audit-level=high` | BLOCKED | `ENOLOCK` |
| Live PostgreSQL and two API instances | NOT RUN | No installed dependencies/DB environment |
| Real browser, TLS and SSH/firewall state | NOT RUN | External environment unavailable |

**Security interpretation:** Passing source tests do not prove deployed controls or prevent hacking. The scanner is high-confidence and pattern-limited; it cannot establish that there are no secrets. Full canonical Git history and independent mature scanner checks are mandatory. No actual secret rotation or host firewall change occurred. The strict release gate is intentionally **NO-GO**.
