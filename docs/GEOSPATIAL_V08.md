# AssetTrust v0.8 — Geospatial Land Intelligence

**Compiled by Aturinzire Hargreave | 7 November 2026**

## Scope and verification boundaries

Parcel boundaries are private **evidence claims** and are never automatically represented as authoritative land boundaries, government title records, or proof of ownership. A record may be *accepted as reviewed evidence* by an accredited surveyor without being independently confirmed by the land registry. Land tenure and legal claims remain in separate evidence processes.

## Delivered architecture (DDD / Clean Architecture)

- Domain: `apps/api/src/contexts/geospatial/domain/parcel-boundary.ts` — GeoJSON coordinate rules, a single-ring polygon policy, self-intersection checks, search envelope limits, independent reviewer rule. Domain has no NestJS or database dependencies.
- Application: `.../application/parcel-usecases.ts` — use cases and repository port; no framework dependency.
- Infrastructure: `.../infrastructure/pg-parcel.repository.ts` — tenant-scoped PostGIS queries and audit-backed transactions. `geospatial.module.ts` adapts HTTP/NestJS, authenticates, and enforces record-level permissions.
- Web: `apps/web/src/GeoPage.tsx` and `styles.css` — a responsive WGS84 coordinate viewer, claim explorer, draft editor and reviewer controls. **The map currently uses a coordinate grid; it does NOT yet provide streets, aerial imagery or certified cadastral tiles.**
- Database: `apps/api/sql/007_geospatial.sql` — PostGIS extension, geometry(POLYGON,4326), GiST index, validity and area checks, status/version history, one accepted claim per asset.

## Geometry representation and rules

GeoJSON coordinates are `[longitude,latitude]` in EPSG:4326, **not** `[latitude,longitude]`. The ring must be closed and have 3–100 unique vertices. Holes and multipolygons are excluded from v0.8 to avoid ambiguous evidence. Duplicate vertices, bow-tie/self-crossing shapes, non-finite numbers, and antimeridian-spanning / large envelopes are rejected. PostGIS independently enforces polygon validity. Area is computed from WGS84 geography in square meters; it is a calculation from the *submitted* outline, not a certified measurement or survey accuracy statement.

## Authorization and workflow

1. An authenticated member must have **CONTRIBUTE** access to the asset (or be its creator/admin) to save a **DRAFT**.
2. Only the original submitter can move that claim to **SUBMITTED**. Submissions record an audit event.
3. Only a different user currently accredited as `SURVEYOR`, with access to the asset and an MFA step-up within 15 minutes, can **ACCEPT** or **REJECT**. Rejected evidence remains in history.
4. An accepted claim **supersedes** an earlier accepted claim for the same asset in a single transaction under an asset row lock. Superseded geometry remains available for provenance.
5. Viewport search is restricted by authenticated organization, asset access permissions and bounded query limits. Drafts do not appear to unrelated users in search. Sensitive parcel coordinates should not be included in public/shareable reports without explicit access policy.
6. Survey evidence should link to appropriately protected documents and traceable surveyor credentials in a future refinement. An accepted outline is *not* sufficient to advance a formal due-diligence case without its separate accepted case evidence.

## HTTP endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/geo/parcels?bbox=west,south,east,north` | Tenant/access-filtered spatial search, maximum two degrees per side |
| GET | `/api/v1/geo/assets/:assetId/parcels` | History for one accessible asset |
| POST | `/api/v1/geo/assets/:assetId/parcels` | Create draft polygon; body `{geometry,sourceKind,sourceReference,notes}` |
| POST | `/api/v1/geo/assets/:assetId/parcels/:id/submit` | Original author submits draft |
| POST | `/api/v1/geo/assets/:assetId/parcels/:id/review` | Independent accredited surveyor records `{decision,reviewNotes}` after recent MFA |

Accepted decision = `ACCEPTED`, rejected decision = `REJECTED`. `sourceKind` must be `CLIENT_SKETCH`, `FIELD_SURVEY`, or `DOCUMENT_TRANSCRIPTION`. User-supplied source labels do not imply authentication.

## Upgrade from v0.7: IMPORTANT

**Back up the database and encrypted document directory before changing database images or running migrations.** The v0.7 compose stack used `postgres:17-alpine` without the PostGIS extension. v0.8 uses `postgis/postgis:17-3.5`. On a disposable/new local database, change the image and run migration 007; PostgreSQL major version remains 17. For an existing persistent data volume, **do not assume a direct image swap will be safe**. Restore a backup into a new PostGIS-enabled test volume and verify `SELECT PostGIS_Full_Version();`, geometry constraints and index behavior before any controlled production cutover. The migrations must be run by a role authorized to create the PostGIS extension, or a DBA must install it first. Maintain encryption secrets from v0.7; do not regenerate keys for existing encrypted files.

Run from the project root after configuring `.env`:

```bash
# New/disposable local database only (do not destroy production volumes)
docker compose up -d postgres
npm install
npm run db:migrate --workspace apps/api
npm run verify:v08
npm run verify:v07
npm run test
npm run build
npm run dev:api
# second terminal: npm run dev:web
```

For a new **disposable** development API and database only:

```bash
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:e2e:geo
```

This E2E script needs real NestJS, PostgreSQL 17 + PostGIS, and test credentials. It is **not run automatically** and must never be used against real clients.

## Self-hosted maps roadmap (separate work)

Use PostGIS privately for tenant-scoped geometry; host licensed open-map basemap tiles through a separate public/controlled tile stack (e.g., regional extract → tile generation → MBTiles/PMTiles → Martin or another tile server → MapLibre GL JS). Do **not** serve tenant-specific parcel geometry in public, cacheable tiles. The protected API should deliver private overlays only after authorization. Set a versioned map style URL (`VITE_MAP_STYLE_URL`) pointing to your own licensed vector-tile service **once deployed**. Include required OpenStreetMap/ODbL attribution when OSM-derived data is used. Do not scrape or bulk-download OSM Foundation's standard public raster tile service; it expressly prohibits bulk/offline prefetch.

Useful official references: [PostGIS validity](https://postgis.net/docs/ST_IsValid.html), [PostGIS geography](https://postgis.net/docs/using_postgis_dbmanagement.html), [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/), [OSM tile use](https://operations.osmfoundation.org/policies/tiles/).

## Remaining quality gates

The current environment can run offline domain/application tests and source-derived render checks, but **cannot** run the NestJS production build or PostgreSQL transactions without installing the dependencies and starting PostGIS. Verify migrations, concurrent acceptance race behavior, privacy under multi-tenant search, token/session revocation, professional accreditation expiry, MFA, field-source provenance, and backups on staging before production. Independent legal review and authorized government data agreements are still required.
