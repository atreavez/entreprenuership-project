# AssetTrust v0.72 — Test Evidence

**Recorded:** 12 November 2026 · offline authoring environment · **Not production certification**

| Gate | Outcome | Detail |
|---|---|---|
| v0.72 tests | PASS | 21 / 21 fault-injection, acceptance and version-compatibility cases |
| Version-script regression v41–v72 | PASS | 32 / 32 suite invocations completed successfully; single long run interrupted after v65, remaining v66–v72 individually re-run |
| Architecture boundaries | PASS | `npm run verify:architecture` |
| TS/TSX transpilation syntax | PASS | 108 source files, 0 diagnostics; **not** full typecheck |
| Vite source import graph | PASS | `npm run build:source:v56` |
| CI workflow completeness | PASS | `npm run verify:ci:v53` |
| GitHub workflow policy | PASS | `ruby tools/workflow-policy-v53.rb`, 70 version suites inventoried |
| SQL migration source | PASS | 27 source entries, unchanged SQL and hashes |
| Limited source credential scanner | PASS | 3,281 source files inspected; no high-confidence pattern match; Git history absent |
| Full API/frontend build | BLOCKED | `npm run build` fails on missing `@types/node`, `@nestjs/common`, `pg` and other packages |
| Reviewed lockfile | BLOCKED | `npm run build:acceptance:inspect:v68` reports `AUTHENTIC_REVIEWED_LOCKFILE_REQUIRED` |
| Genuine npm installation and audit | NOT RUN | Registry DNS not reachable; no authentic lockfile; not bypassed |
| Real PostgreSQL transaction failover | NOT RUN | Driver/database unavailable; isolated fake-PG fault scenarios only |
| Docker PostGIS/ClamAV and HTTP | NOT RUN | No live services in this environment |
| Original Git history credential scan | NOT RUN | No original `.git` history in checkpoint |
| Production release | **NO-GO** | Final security gate, deployment and browser evidence missing |

**What the new tests actually establish:** The transpiled production Database adapter correctly rolls back or discards pooled clients under injected errors. The supervisor now accepts only build evidence matching the current source version and v72 regression step. The tests are simulated and do not assert external PostgreSQL fault behavior.

Evidence command outputs are available inside `test-evidence/v72/`. Avoid uploading raw database configurations or `.assettrust-local` files.
