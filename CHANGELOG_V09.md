# AssetTrust v0.9 — Self-Hosted Mapping Infrastructure

- Added MapLibre GL JS frontend adapter for **same-origin** raster-tile styles and protected parcel overlays. A standalone map-policy domain rejects external styles and strips private document/identity fields from rendered feature properties.
- Added a standard-library, read-only raster MBTiles service (`/maps/style.json`, `/maps/tiles/z/x/y.png`, `/maps/healthz`) with image-format signature validation and route bounds.
- Added a small explicitly synthetic demonstration MBTiles grid for offline tests (no real cartographic data).
- Added local Docker `maps` profile, source-based responsive map previews, self-hosted map tests, deployment example and documentation.
- Fixed missing `GeospatialModule` import in `apps/api/src/main.ts` found during v0.8 review; CI database service updated to PostGIS (previously plain PostgreSQL).
- Enabled map configuration from the monorepo root `.env` in Vite; user can fall back to a coordinate grid when tiles are unavailable.
- Existing professional trust, identity security, encrypted document vault and private geospatial claims remain unchanged.

**Release state:** development checkpoint; npm build/React MapLibre runtime/PostGIS E2E tests remain unverified.
