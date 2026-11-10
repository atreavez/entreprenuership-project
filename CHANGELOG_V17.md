# AssetTrust v0.17 — Strict dependency integrity and Clean Architecture release gate

**Compiled by Aturinzire Hargreave**  
**Scope:** continuation of v0.16; no features or UI layouts removed.

## Added
- Strict, standalone npm lockfile-graph validator (`tools/lockfile-integrity-v17.cjs`), including workspace name and version agreement, manifest/lock dependency-range parity, workspace symlink targets, direct and transitive dependency entries, and cryptographic-integrity hash encoding on remote registry tarballs.
- Dependency-free Clean Architecture policy covering *all* current bounded contexts, not only the verification domain (`tools/clean-architecture-v17.cjs`).
- Fourteen v0.17 tests, including a regression for the formerly accepted superficial lockfile and negative tests for stale ranges, missing transitive packages, truncated integrity hashes, outward imports, and direct environment access.
- `npm run verify:v17` and `npm run release:gate:v17`.
- GitHub CI early gating before `npm ci`, with v0.17 tests also rerun in the regular regression suite.

## Correctness and release decision
- Offline v0.3–v0.16 regression commands executed successfully in this environment.
- `npm run verify:v17` reports 14 passing tests.
- `npm run verify:syntax` reports 54 TypeScript/TSX files with zero syntax diagnostics, **not a completed build**.
- `npm run build` still fails: `TS2688 Cannot find type definition file for 'node'`.
- `npm ci --offline` cannot proceed because `package-lock.json` is absent; npm registry requests fail with `EAI_AGAIN`.
- Real PostgreSQL/PostGIS, HTTP and browser test runs were not possible here.
- **Release blocked; NOT production-ready.**

## Explicit limitations of the new checks
- Lockfile structural checks cannot verify that a remote tarball actually matches its recorded hash; `npm ci` enforces package integrity at installation time.
- They cannot replace dependency vulnerability review, license review, a successful build or runtime tests.
- The correct repair is to generate the real lockfile with npm on a connected machine; do not fabricate, silence, or bypass the gate.
