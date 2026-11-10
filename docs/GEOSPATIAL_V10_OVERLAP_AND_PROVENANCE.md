# AssetTrust v0.10 — Preliminary Boundary Overlap and Trusted Geodata

**Compiled by Aturinzire Hargreave · 7 November 2026**

## Scope, evidence boundaries and architecture

This release adds **preliminary geometric comparison** between an asset's submitted land outline and *accepted private* land outlines on **other assets that the same user is already allowed to access within their organization**. This is not a statement of fraudulent ownership, a government cadastral overlay, a survey certificate or a legal dispute ruling. Private visibility filters ensure a user does not learn about another tenant's property or an unshared property. Organizations with no shared accepted outline in the query will see an empty result, which does **not** establish clear title.

Use case: a buyer supplies survey coordinates for a Wakiso parcel. A surveyor can review the geometry, and a client may request preliminary overlap comparison with accessible accepted claims. Where overlap appears, the user is instructed to obtain a qualified survey and official land search rather than proceed automatically.

DDD boundaries:

```text
React Land Intelligence (presentation)
     -> NestJS GeospatialController (transport + asset authorization)
     -> ParcelUseCases (application orchestration, repository port)
     -> parcel-overlap.ts (pure preliminary overlap classification)
     -> PgParcelRepository (PostGIS tenant-scoped query)

Separate public MapLibre /maps endpoint -> local licensed raster MBTiles server
No private parcel features are included in tile archives.
```

### Domain classification (not statutory thresholds)

| Condition | Response | Meaning |
| --- | --- | --- |
| 0 sq m intersection | `NONE` | No intersection with an accessible accepted geometry in this comparison |
| Intersection under 1 sq m or under 1% of smaller parcel | `TRACE` | Precision/digitization sliver; document and examine if relevant |
| At least 1% but below 20% | `REVIEW` | Human boundary comparison recommended |
| At least 20% | `HIGH_ATTENTION` | Significant geometric overlap requires prioritized professional checking |

All thresholds are configurable policy candidates for future professional consultation. They are **not legal boundaries or government standards**. Percent is overlap area divided by the smaller polygon's geodesic area, bounded to 100% for numerical safety. The algorithm does not detect encumbrances, duplicate titles, caveats, official boundary errors, or disputes if their geometry is unavailable. It does not compare across tenants.

### API

`GET /api/v1/geo/assets/:assetId/parcels/:claimId/overlaps` requires valid session and *read permission on the subject asset*. It returns at most 20 hits, matching accepted private outlines only, with the other asset's code, claim ID, intersecting area, percentage of smaller area, severity, and notice. Candidates are bounded to 40 *accessible, same-organization* accepted outlines before the intersection calculation. It does not grant access to missing assets and does not disclose other tenants.

The subject must belong to the requested asset and same tenant. Numerical area is computed using PostGIS geography. `ST_CollectionExtract(...,3)` excludes line-only/shared-edge contacts before measuring area. Geospatial requests do not return raw SQL/internal database exception messages.

### Security and privacy

- Do not expose these endpoints without the current access guard and authenticated account.
- The map tile service contains **public licensed basemap only**. Private boundaries stay in the authenticated PostGIS API; never include IDs, notes, addresses, or identity documents in public tiles.
- Results reveal information only for other assets already accessible to the same principal. Do not later replace this with an unconditional organization-wide or cross-tenant scan.
- In a later permitted inter-agency workflow, consider privacy-preserving conflict flags that disclose no third-party parcel identifiers until independent legal authorization exists.
- Maintain an auditable review process, clear provenance, and dispute escalation. A visual intersection is not equivalent to a title contradiction.

## Licensed Uganda data: supply, validate, then host

The existing v0.9 server **requires raster MBTiles** (PNG/JPEG/WebP). A Geofabrik `.osm.pbf` extract is raw vector OSM data and **cannot be renamed to `.mbtiles`**. On a connected GIS workstation:

1. Obtain Uganda OpenStreetMap data lawfully, e.g. **Geofabrik Uganda regional extract** at `https://download.geofabrik.de/africa/uganda.html`. Record the retrieval date, source, license and checksum. OSM-derived data normally falls under **ODbL 1.0**; confirm licensing for all additional layers and styles.
2. Process the data with a genuine locally hosted styling/rendering workflow: e.g., import `.osm.pbf` with `osm2pgsql` into a GIS database, style roads/places/landcover/water in QGIS, then use a locally generated raster MBTiles tile export. Alternatively use licensed raster MBTiles from a provider that allows redistribution and offline hosting. Do **not** harvest the OpenStreetMap Foundation public raster tile server.
3. Verify that the generated archive contains legitimate geographic features at the desired Uganda zoom levels and has correct bounds, metadata and attribution. The included synthetic grid is only for tests.
4. Import that **already generated raster MBTiles** into AssetTrust with the checked importer below, then set the same attribution in `.env` and start the read-only tile server.
5. Ensure users can see the required attribution in MapLibre. Review offline distribution / derivative-database conditions with the data provider. Never claim private parcel overlays are official government cadastral data.

Import command (replace the file and source URL with the real files you obtained):

```bash
python3 tools/provision-raster-basemap-v10.py \
  --input /path/to/your/licensed-uganda-raster.mbtiles \
  --output ./data/maps/uganda.mbtiles \
  --source-url https://download.geofabrik.de/africa/uganda.html \
  --license-id ODbL-1.0 \
  --license-url https://www.openstreetmap.org/copyright \
  --attribution '© OpenStreetMap contributors' \
  --kind REAL_GEOGRAPHY
```

**Important:** In this example the `--source-url` refers to the underlying geography source; only use it if your actual raster file was derived from that source. For other suppliers record their real provenance and licensing; don't invent a source. The importer validates read-only MBTiles structure, sample tile bytes, metadata, and content hash, but it cannot independently verify that a map's geography is correct or that the operator's copyright declaration is truthful. Existing output files are refused unless `--replace` is set intentionally.

For the local server:

```bash
ASSETTRUST_MBTILES_PATH="$PWD/data/maps/uganda.mbtiles" \
ASSETTRUST_MAP_ATTRIBUTION='© OpenStreetMap contributors' \
python3 -m services.tiles.tile_service
```

**New v0.10 startup protection:** The tile server supports `ASSETTRUST_MAP_REQUIRE_MANIFEST=true`, which checks the imported `.manifest.json` checksum, format and attribution on startup. The optional `ASSETTRUST_MAP_PRODUCTION_DATA=true` additionally rejects datasets explicitly tagged synthetic. The Docker Compose mapping service sets both flags to true. The local v0.9 synthetic-grid testing command leaves them false. SHA checks identify accidental dataset/manifest mismatches but are not an authenticated publisher signature; a malicious operator with write access to both files could replace them. Secure file permissions, trusted data suppliers and a future signed import attestation are still required for high-assurance production.

See the existing `docs/SELF_HOSTED_MAPS_V09.md` for Compose and Vite map settings. `--kind SYNTHETIC_TEST_ONLY` is required when using synthetic test data. A record labelled `REAL_GEOGRAPHY` should only be used following a real data/provenance review.

## Development verification

```bash
npm run verify:v10
npm run verify:v08
npm run verify:v09
npm run verify:syntax
npm run build # requires npm dependencies
# In a disposable local database with API listening:
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:e2e:overlaps
```

**v0.10 remains a development checkpoint** until npm dependencies are installed, the NestJS API and React app build successfully, real PostGIS queries run against a test database, and role/tenant/isolation smoke tests pass. The local API smoke script can test endpoint authorization and pending/draft filtering, but does not fake accredited approvals or claim to test real overlap results without approved evidence.

## Useful official sources

- Geofabrik Uganda downloads: https://download.geofabrik.de/africa/uganda.html
- OpenStreetMap copyright and ODbL terms: https://www.openstreetmap.org/copyright
- OpenStreetMap Foundation tile policy: https://operations.osmfoundation.org/policies/tiles/
- MapLibre GL JS docs: https://maplibre.org/maplibre-gl-js/docs/
