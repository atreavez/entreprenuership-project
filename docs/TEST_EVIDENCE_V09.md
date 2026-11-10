# v0.9 Test Evidence and Outstanding Gates

**Compiled by Aturinzire Hargreave | 7 November 2026**

The new mapping tests were first run without the implementation (RED), failing on missing source modules. After creating the pure map-policy code and Python read-only tile service, they passed (GREEN). The HTTP test runs against a real loopback HTTP service and a **temporary SQLite MBTiles fixture**, not a simulated router.

Verified in this workspace:

| Check | Result |
| --- | --- |
| v0.9 pure same-origin URL, minimal feature and bounds tests | 5 passed |
| v0.9 Python TileStore and loopback HTTP tests | 10 passed |
| v0.3–v0.8 existing offline regression suites | Passed |
| TypeScript/TSX transpile/syntax scan | 48 files, zero syntax diagnostics |
| Isolated map-policy TypeScript typecheck | Passed |
| Static source-derived UI preview, desktop + mobile | Rendered, no horizontal overflow at 1440/390 px |
| Docker Compose service configuration | Written, Docker not available for execution |
| Actual MapLibre runtime against licensed map tiles | Not run |
| `npm install`, complete `npm run build` | Blocked by npm registry DNS error `EAI_AGAIN` |
| PostGIS / multi-tenant integration tests | Not run |
| Production security assessment / performance / GIS accuracy | Not run |

**Don't confuse static React source previews, a synthetic demonstration MBTiles file, or a passed HTTP test with a deployed or verified production map.**
