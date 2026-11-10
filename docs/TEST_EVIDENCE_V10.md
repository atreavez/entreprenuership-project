# v0.10 Test Evidence and Release Readiness

**Compiled by Aturinzire Hargreave · 7 November 2026**

## Executed in this environment

| Verification | Actual result | Evidence / limitations |
| --- | --- | --- |
| v0.10 overlap tests | **9 passed** | Pure classification, application delegation, SQL tenancy/access guard assertions, polygon-only intersections, safe errors |
| v0.10 map provisioning & manifest tests | **11 passed** | Readonly raster import, metadata/hash, overwrite refusal, invalid attribution/URLs, symlink refusal, manifest binding, synthetic production rejection |
| v0.9 mapping policy tests | **5 passed** | Pure same-origin map rules |
| v0.9 tile service Python tests | **10 passed** | Includes loopback HTTP requests with synthetic MBTiles |
| v0.8 parcel/application tests | **15 passed** | Test harness updated to inject the new v0.10 pure domain dependency |
| v0.3–v0.7 regression commands | **Passed** | Individual logs retained in packaging; no assertion of full integration |
| Geospatial domain/application `tsc --noEmit --strict` | **Passed** | Three independent DDD-domain and application TS files, not the NestJS app |
| TS/TSX source transpilation/syntax | **49 files; zero syntax diagnostics** | Not the same as full `tsc` app build |
| Source-based React previews | **Desktop 1440px, mobile 390px; no horizontal overflow** | Not running React/Vite or live MapLibre network |
| v0.10 CLI syntax and map source tests | **Passed** | Python bytecode check and Node E2E script syntax |
| Full `npm run build` | **Not verified** | Fails early because Node type definitions and dependencies are unavailable |
| Live PostgreSQL/PostGIS overlap query | **Not run** | No PostgreSQL or Docker service in environment |
| Live NestJS + React + MapLibre browser testing | **Not run** | npm registry unavailable (`EAI_AGAIN`), browser previews were static/source-derived |
| Licensed **real** Uganda basemap | **Not included** | Only clearly marked synthetic raster test tiles bundled |
| GitHub Actions integration | **Configured, not executed** | CI adds v0.10 offline and localhost E2E commands |

## Test-driven development record

1. The initial overlap tests were run before `parcel-overlap.ts` existed: **7 failing tests (RED)**, logged as `TDD_RED_v10.log`.
2. The new domain, repository port, scoped PostGIS query and controller were implemented: the same seven tests passed (GREEN).
3. Four separate manifest binding tests were run before the server accepted manifest settings: **four errors (RED)**, logged as `manifest_RED.log`.
4. Startup manifest verification was implemented; all nine Node domain/policy tests and all eleven Python importer/manifest tests now pass (GREEN).
5. Older v0.8 tests initially encountered a **test harness** missing a newly imported module. The harness was corrected; the earlier geospatial suite passes again. This correction did not loosen application policy.

## Real release gates still required

On Kali Linux or a CI runner with npm, Docker, PostgreSQL/PostGIS and compatible Node.js:

```bash
cp .env.example .env # configure unique secrets; retain keys if upgrading
npm install
npm run build
npm run test
npm run verify:v10
npm run verify:v08
npm run verify:v09
docker compose up -d postgres
npm run db:migrate --workspace apps/api
npm run dev:api
npm run dev:web
# For localhost-only database mutations on an isolated test DB:
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:e2e:overlaps
```

After a licensed real raster basemap has been provisioned, test a real browser against `/maps/style.json` and `/maps/tiles/*`, verify visible attribution, tile coverage, and operator-updated manifest validation. Before any production launch, also test against malicious assets and alternate organizations, perform a penetration test, confirm file/secret isolation, establish DB backups and audit retention, and obtain legal guidance on land-record and data-protection integrations.

**Do not equate the static UI renders or offline tests with a deployment or approved land registry.**
