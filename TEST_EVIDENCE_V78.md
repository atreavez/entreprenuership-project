# AssetTrust v0.78 — Test Evidence

**Captured:** 12 November 2026. **Environment:** isolated source-validation container, Node.js v22.16.0; no installed project dependencies, PostgreSQL server or Docker service.

| Command / verification | Recorded result |
|---|---|
| `npm run verify:v78` | PASS — 30/30 tests |
| `npm run verify:v11` / historical migration suite | PASS — 10/10 legacy migration tests |
| `npm run verify:v41` through `npm run verify:v78` | PASS — 38/38 version commands (sequential and individually retried as required) |
| Counted TAP case successes in version matrix | 695 |
| `npm run verify:architecture` | PASS — 3/3 |
| `npm run verify:syntax` | PASS — 108 TS/TSX transpiled; not full typecheck |
| `npm run build:source:v56` | PASS — 105 source files, 291 relative imports |
| `npm run verify:ci:v41` | PASS — 76 declared version commands and 33 PostgreSQL contracts |
| `ruby tools/workflow-policy-v53.rb` | PASS |
| `node tools/secret-scan-v43.cjs` (source only) | PASS — 3,526 scanned files, 0 high-confidence findings |
| `npm run security:scan:v54` (including Git history) | BLOCKED — no Git history in archive |
| `npm run lockfile:check:v55` | BLOCKED — genuine `package-lock.json` absent |
| `npm run build` | FAIL/BLOCKED — cannot resolve missing dependency/type packages, including Node types and NestJS |
| `npm run test:pg:migration-lock:v78` | NOT RUN — requires authorized disposable live PostgreSQL and installed `pg` |
| Real two-API, document, dispute, browser and payment acceptance | NOT RUN |

### Regression execution record

The initial matrix reached v0.72 before execution was interrupted by a tool limit. v0.73–v0.78 were then run individually. The v0.75 suite initially failed on a hard-coded accepted version expression ending at v0.77; its version-only test fixture was updated to also accept v0.78. The final v0.75 suite then passed 24/24. All other final suite results report zero failures.

### Behavior specifically covered by v0.78 tests

- When another PostgreSQL session owns the migration lock, the runner exits before reading the schema or ledger and closes the client.
- Unknown/malformed lock results fail closed; the historical integer ID is passed as a query parameter.
- A connection failure still invokes cleanup.
- Check mode does not create a migration ledger; it rejects missing, tampered or incomplete ledgers.
- New migrations use per-file transactions with checksummed ledger inserts.
- SQL, BEGIN, COMMIT, ROLLBACK, unlock and connection-close failures do not yield false successes.
- The original error is retained when a secondary cleanup fails.
- The Kali wrapper refuses missing consent, a production environment, invalid private config and forged child success records.

**Evidence limit:** Most results above use mocks, source inspection or TypeScript transpilation; real PostgreSQL, dependency-backed compilation and HTTP/browser execution remain unverified.
