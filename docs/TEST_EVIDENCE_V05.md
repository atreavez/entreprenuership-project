# AssetTrust v0.5 — Test evidence and release decision

Compiled by **Aturinzire Hargreave** | 6 November 2026

| Check | Result | Limit |
|---|---|---|
| TDD initial RED test | Observed failing | Module not yet implemented |
| Pure domain identity tests | **8 passed** | Unit/pure crypto; no HTTP/DB |
| Session application tests | **6 passed** | In-memory repository fake |
| v0.5 security architecture/source contract tests | **7 passed** | Static source contracts; not runtime permission tests |
| Existing v0.4 evidence workflow use cases | **12 passed** | Offline |
| Existing v0.4 architecture/security checks | **3 passed** | Source-level |
| Existing v0.3 verification policy checks | **17 passed** | Offline/source-level |
| Existing offline helper smoke | PASS | Pure helper logic only |
| TypeScript/TSX transpilation | PASS (32 source files checked) | Syntax only; not full typechecking |
| New Security React static design render | PASS desktop and mobile | Not React runtime; source-derived preview |
| Security screen horizontal overflow | PASS at 1440 px and 390 px | Other breakpoints not fully tested |
| Full `npm install`, `npm test`, `npm run build` | **NOT VERIFIED** | Missing npm cached dependencies in authoring environment |
| `004_identity_security.sql` migration | **NOT RUN** | PostgreSQL unavailable in authoring environment |
| Live HTTP/PostgreSQL identity E2E | **NOT RUN** | Script supplied for local/CI environment |
| CI pipeline | **NOT RUN** | Workflow updated, not executed |

Use the following commands on a machine with a properly installed npm toolchain:

```bash
npm install
npm run smoke:offline
npm run verify:v03
npm run verify:v04
npm run verify:v05
npm run verify:syntax
npm test
npm run build
npm run db:migrate --workspace apps/api
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:e2e:local
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:e2e:identity
```

The E2E scripts create disposable accounts and records; only use on disposable localhost development environments. **Release decision: NOT PRODUCTION READY.**
