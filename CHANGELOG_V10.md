# v0.10 — Geospatial evidence comparison & licensed map provisioning

**Compiled by Aturinzire Hargreave · 7 November 2026**

1. Introduced an independent, framework-free parcel overlap classification (`parcel-overlap.ts`), with preliminary thresholds rather than legal findings.
2. Added an authenticated, scoped overlap endpoint in `ParcelController`, an application use case/repository contract, and a PostgreSQL/PostGIS adapter using access-controlled candidates only.
3. Added a responsive source-based Land Intelligence comparison panel (desktop/mobile) with explicit privacy and verification disclaimers.
4. Added a conservative offline importer for already licensed raster MBTiles, recording source/attribution/license declarations, tile integrity checks, and SHA-256 provenance manifests.
5. Added startup manifest verification for locally served map tiles: matching SHA-256, format, attribution and explicit prohibition of synthetic datasets in the Compose mapping service.
6. Prevented internal SQL errors from being returned verbatim by the geospatial controller. Hardened the raster tile service's read-only SQLite connection lifecycle.
7. Added test-first v0.10 policy and importer tests, isolated TypeScript domain/application compilation, and an optional localhost-only geospatial API smoke script.
8. Preserved the previous v0.1–v0.9 codebase. No paid map API, government cadastre, public parcel endpoint or fictional official data was added.

See `docs/GEOSPATIAL_V10_OVERLAP_AND_PROVENANCE.md` and `docs/TEST_EVIDENCE_V10.md`.
