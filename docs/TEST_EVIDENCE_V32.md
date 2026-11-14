# AssetTrust v0.32 — Test Evidence and Release Decision

**Checkpoint:** Published Content Integration  
**Baseline:** AssetTrust v0.31  
**Compiled by:** Aturinzire Hargreave

## Verified in this environment

- **13/13** new v0.32 offline tests passed, including pure publication policy, actual `PublishedContentService` read adapter (mocked SQL), real `DashboardService.report` and `CasesService.assign` methods (controlled query substitutes), tenant isolation, invalid published text, public allowlist, legal disclaimers and deny-by-default external notification adapter.
- **33/33** regression commands passed (`smoke:offline`, v0.3–v0.32, architecture, syntax). Logs and JSON command manifest are under `test-evidence/v32`.
- **75** TypeScript/TSX source files passed offline syntax transpilation, **0 syntax diagnostics**. This does **not** establish full TypeScript type safety.
- Existing SQL migrations **001–012** have identical SHA-256 bytes to v0.31. No v0.32 schema migration is required.
- GitHub Actions YAML parsed, with the new offline test and disposable PostgreSQL contract test steps registered.
- Source-rendered desktop **1440px** and mobile **390px** Content Studio previews have no horizontal overflow. An additional source-based sign-in preview was rendered. These previews are not full live React runtime tests.
- ZIP archive integrity and SHA-256 fingerprints are verified during packaging.

## Test-first evidence

`test-evidence/v32/tdd-red.log` captures an initial failed publication-domain test before the new module existed. The first GREEN suite had 5 passing tests. The expanded final v0.32 suite has 13 passing tests. Historical v0.24/25 loaders were revised to accommodate the added content-publishing dependency; the regression scenarios remain intact.

## Blocked or not executed

| Release gate | Result |
|---|---|
| `npm ci --offline` | **Failed** — no authentic `package-lock.json` |
| `npm run release:gate:v17` | **Failed** — absent lockfile |
| `npm run build` | **Failed** — NestJS/Node/project dependencies unavailable (`TS2307`/`TS2688`) |
| `npm run test:pg:publish:v32` | **Not executed against PostgreSQL** — test refused to start without explicit disposable authorization; this is expected safety behavior |
| Live PostGIS schema + API | **Not verified** here |
| Browser end-to-end interactions | **Not verified** here |
| External SMS/email providers | **Disabled**; interface only |
| Digitally signed PDF issuance | **Not implemented** |

**Release decision: BLOCKED / NOT PRODUCTION-READY.** Offline test success is not permission to deploy private legal/evidence data into production.

See `docs/V32_KALI_VALIDATION.md` for reproducible build and disposable-database instructions.
