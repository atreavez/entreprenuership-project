# AssetTrust v0.87 — Test Evidence

**Result:** 47/47 offline regression suites passed; 979/979 recorded test cases passed. **No live PostgreSQL/API/browser acceptance** was run on the authoring host.

## New v0.87 security regression suite

- `npm run verify:v87`: **30/30 passed** using synthetic locally generated source/build records and injected subprocesses.
- Reusing these v0.87 tests against the unchanged v0.86 supervisor: **27/30 fail, 3/30 pass** (intentional RED baseline). Corrected v0.87: **30/30 pass**.
- Verified failure conditions: modified API or web source, SQL, deployment and CI files, build tooling, root lockfile, backend compiled entry and nonentry outputs, frontend JS/CSS, additional/deleted/symlinked output, build-evidence alteration, mutation after a stage, thrown reviewer errors, mid-command race, and private evidence redaction.
- Unmodified synthetic successful acceptance remains `ACCEPTANCE_COMMANDS_PASSED_RELEASE_BLOCKED`, never production approval.

## Historical suite coverage

All 47 scripts `verify:v41`–`verify:v87` completed successfully. The complete TAP logs are in `test-evidence/v87/version-suites/verify:vNN.log`; counts and exit codes are in `test-evidence/v87/version-matrix.json`. All 27 SQL migrations were compared byte-for-byte to v0.86 and were unchanged.

## Other executed checks

| Command/check | Actual outcome |
|---|---|
| `verify:architecture` | PASS |
| `verify:syntax` | PASS (transpilation/syntax, not dependency-backed compilation) |
| `build:imports:v80` | PASS |
| `build:source:v56` | PASS |
| `verify:ci:v53` | PASS (Ruby/Psych YAML parser and security-policy validation) |
| `security:scan:v43` | PASS for limited high-confidence snapshot patterns |
| `security:scan:v54` | BLOCKED: original `.git` metadata unavailable |
| `npm run build` | FAILED: missing installed `@nestjs/*`, Node and other TypeScript declarations; no authentic dependencies |
| `lockfile:check:v55` | BLOCKED: authentic `package-lock.json` absent |
| `acceptance:provenance:inspect:v86` | Correctly BLOCKED before any real supervised build |
| `kali:acceptance:inspect:v87` | Read-only, checkout recognized, no private fixture/build readiness |
| `kali:acceptance:plan:v87` | PASS, no live action |
| Live PostgreSQL/PostGIS, ClamAV, HTTP, browser | NOT EXECUTED |

**Caution:** A synthetic source/build fixture exercises the *real hashing/checking logic* and simulates child outcomes. It is not evidence that real npm installation, PostGIS, ClamAV or any running application is working. The next milestone must be based on real Kali logs.
