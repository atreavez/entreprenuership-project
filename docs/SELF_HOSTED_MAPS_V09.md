# AssetTrust v0.9 — Self-Hosted Basemap and Private Parcel Overlays

**Compiled by Aturinzire Hargreave | 7 November 2026**

## Purpose and limits

This checkpoint adds a **working standard-library Python MBTiles raster server** and a MapLibre GL JS adapter in the React Land Intelligence page. It does **not** supply Uganda's authoritative cadastral map, ownership information, satellite imagery, roads, or a production vector tile system. Only the **synthetic and clearly labelled grid** is included as a small test dataset; real basemap data must be obtained or generated under a suitable licence. This distinction is intentional: a private survey sketch and a government-recognized boundary are not interchangeable.

PostGIS (private data) and the public raster basemap are independent:

```text
Protected pathway: Browser access token → NestJS /api/v1/geo/parcels →
   tenant + asset authorization → PostGIS → minimal private GeoJSON overlay → MapLibre

Public/local pathway: Browser /maps/style.json → same-origin reverse proxy →
   read-only Python MBTiles server → licensed raster MBTiles → MapLibre background
```

Never publish the authenticated parcel API as a public `/maps` tile layer, export private geometries into MBTiles, or cache document/identity information in CDN tiles. Legal ownership and official registration require independent, authorized evidence.

## Implementation layout / engineering principles

- **Domain:** `apps/web/src/map/domain/map-policy.ts` has pure functions to validate same-origin style paths, safe basemap schemas, request bounds, and minimal claim feature properties. No React, backend or external library dependency.
- **Adapter:** `apps/web/src/map/LocalMap.tsx` initializes MapLibre after fetching a same-origin validated raster style, renders clickable user-authorized parcel boundaries, and updates selection. It never makes third-party basemap calls. The existing coordinate grid is retained as a fallback.
- **Service:** `services/tiles/tile_service.py` opens raster MBTiles in SQLite read-only mode, translates XYZ y to MBTiles TMS y, verifies signatures, bounds requests, sends correct content types and rejects unrecognized routes. Only `GET` endpoints are exposed; no raw files or database schema endpoints.
- **Platform:** `apps/web/vite.config.ts` proxies `/maps` only to a localhost service; optional Compose profile `maps` runs the same service in a read-only Docker container. A Caddy example keeps `/maps` and `/api` separate.
- **Security:** `/api/v1/geo/parcels` remains authenticated, tenant scoped and subject to asset access checks and viewport bounds. No user identity, private note, document filename or evidence reference enters the map feature properties.
- **TDD:** Python server test was run **RED** before service creation; pure mapping-policy tests were run RED before implementation, then both passed GREEN. See `docs/TEST_EVIDENCE_V09.md`.

## Two setup paths

### A. Test the self-hosting pipeline without any map purchases (synthetic grid)

A small, labelled `data/maps/uganda-demo.mbtiles` is included. **It contains no real roads, surveyed borders, buildings, satellite data or official map tiles.** It proves raster self-hosting and local MapLibre wiring, and covers a limited rectangle around Kampala at zooms 5–13.

Start the tile service in terminal 1, from the project root:

```bash
ASSETTRUST_MBTILES_PATH="$PWD/data/maps/uganda-demo.mbtiles" \
ASSETTRUST_MAP_ATTRIBUTION='Synthetic demonstration grid — NOT real map data' \
python3 -m services.tiles.tile_service
```

Check the endpoints:

```bash
curl -fsS http://127.0.0.1:8081/maps/healthz
curl -fsS http://127.0.0.1:8081/maps/style.json
```

The optional `npm run maps:demo` script regenerates the fake dataset and needs **Pillow** (`python3 -m pip install Pillow` in an appropriately managed virtual environment). The included MBTiles file means regeneration is not necessary.

### B. Use your own licensed real-world tiles

1. Obtain geography from a lawful source, such as a regional OpenStreetMap extract under the applicable ODbL and attribution rules; a popular source of regional OSM extracts is Geofabrik. **Do not bulk scrape OpenStreetMap Foundation public tile endpoints.**
2. Style licensed road, place, land-cover and water layers in a GIS tool such as QGIS, using locally stored geographic data—not a scraped web tile layer.
3. Export **raster MBTiles** using a suitable local GIS tile-rendering workflow (for example, QGIS *Generate XYZ tiles (MBTiles)*). Use sensible Kampala/Uganda extents and zoom levels to control storage costs. Place the result in `data/maps/uganda.mbtiles`.
4. Set `ASSETTRUST_MAP_ATTRIBUTION` to the exact attribution required by the real tile data and any style assets. For OSM-derived data, include `© OpenStreetMap contributors` and review the ODbL requirements.
5. Run the tile server against `data/maps/uganda.mbtiles` or enable the Compose `maps` profile. The Python service handles PNG, JPEG and WebP **raster MBTiles**. **Vector `pbf` MBTiles/PMTiles are not supported by this v0.9 service**; they require a different style/protocol or a vector tile server in a later milestone.

For a locally licensed raster file in `data/maps/uganda.mbtiles`:

```bash
# Edit .env with the legally correct ASSETTRUST_MAP_ATTRIBUTION
# On a machine with Docker installed and the licensed file already present:
docker compose --profile maps up -d maps
```

The Compose tile service is bound to `127.0.0.1:8081`, not publicly reachable without an explicit reverse proxy. It mounts the MBTiles directory read-only. For production, serve through same-origin HTTPS proxy (see `deploy/Caddyfile.example`) rather than relying on the Vite development proxy.

### Enable the real React map

In the **root** `.env`:

```env
VITE_SELF_HOSTED_MAP_ENABLED=true
VITE_LOCAL_MAP_STYLE_PATH=/maps/style.json
```

The Vite `envDir` points to the monorepo root. After installing dependencies, restart `npm run dev:web` whenever `.env` changes. The React app uses **MapLibre GL JS** with no paid map account. If the tile service fails, the map switches back to its existing coordinate-grid display and preserves the private parcel list. The `#geo` navigation route is the Land Intelligence screen.

## Testing

From project root:

```bash
npm run verify:v09
npm run verify:v08
npm run verify:v07
npm run verify:syntax
```

`verify:v09` checks same-origin basemap policy, leakage prevention, bounded viewports, XYZ/TMS math, file-signature checks, path traversal handling and live loopback HTTP responses. These tests need Python 3 and the global/project TypeScript compiler, but not PostGIS. The new MapLibre code **still requires npm install + full build + live browser testing** before it can be considered verified.

## Production blockers and security considerations

- A **real, licensed Uganda basemap** must be provisioned, attributed, updated, backed up and legally reviewed. The bundled raster grid is not one.
- Install npm dependencies and complete `npm run build`; then verify MapLibre in a real browser with the service running. The current workspace could not download npm dependencies.
- Perform end-to-end PostGIS tests for privacy across organizations; enforce least-privilege map access. Be careful with boundary-coordinate disclosure on exported reports.
- Put the service behind HTTPS, rate limiting, request caps, observability and appropriate attribution. Public raster tiles may be cached; private claims and documents must not.
- Raster MBTiles do not magically supply high-detail imagery; if imagery is desired, acquire a licence or use legally redistributable imagery. Ownership or tenure still comes from separate evidence workflows.
- For mobile offline map usage, distribute only map data whose licence explicitly permits it; don't prefetch tiles from public OSM infrastructure.
- See official MapLibre documentation: https://maplibre.org/maplibre-gl-js/docs/ ; OSM Foundation tile policy: https://operations.osmfoundation.org/policies/tiles/ ; PMTiles protocol documentation for later vector stacks: https://docs.protomaps.com/pmtiles/maplibre .
