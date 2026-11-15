# AssetTrust v0.49 - Test evidence

All records are from the local offline source/testing environment on 11 November 2026.

- v49 tests: **9/9 PASS** (migration policy, manifest, transaction-scoped query wrapper, query-path inventory, transaction guards, public report verification path, production startup checks, guarded live contract configuration, CI coverage).
- Historical/current verification commands: **47/47 PASS**, v03 through v49. Logs retained in `test-evidence/v49/`.
- Architecture: PASS. TypeScript/TSX syntax-only: **102 files, no diagnostics**. CI completeness: PASS, **47** version scripts and **23** declared PG tests.
- Migration SHA-256 audit: **24/24 matched**; existing SQL migrations were not edited.
- Current-source high-confidence secret scan: **1,923 files scanned, 0 matches**. Limited pattern coverage and no `.git` history.
- Full application build: **FAILED / BLOCKED** because NestJS, pg and Node type dependencies are absent; not a typecheck pass.
- Read-only release preflight: **3/11 prerequisites present**, NO-GO.
- v49 PostgreSQL contract: **NOT EXECUTED**; safety guard correctly rejects tests without disposable DB authorization, installed `pg` and a live loopback test database.
- No live two-API concurrency, user browser, network firewall, TLS/HTTPS, git-history, dependency vulnerability or malware scanning evidence in this environment.

Do not interpret offline verification, ZIP consistency or snapshot scans as approval for real customer evidence.
