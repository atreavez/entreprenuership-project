# AssetTrust v0.80 changelog

- Declared a previously transitive-only direct Express package dependency in the API workspace (`express: ^5.1.0`).
- Changed API Express Request/Response imports to TypeScript `import type` where they are used only as types.
- Added `tools/direct-dependency-policy-v80.cjs` to audit literal source package imports against each workspace's direct dependency manifest, with scoped-package, Node builtin, Vite dev-config and symlink safety handling.
- Added 17 new tests in `tools/tests-v80`, including missing-dependency negatives and CI sequencing.
- Registered `npm run build:imports:v80` before installation in GitHub Actions and `npm run verify:v80` in the full test matrix.
- Made legacy v0.75 and v0.79 version fixtures compatible with future milestones while keeping their underlying security assertions.
- Aligned all three manifests to `0.80.0`. Retained all 27 SQL migrations byte-for-byte.
- Added v0.80 security report, test evidence and Kali validation guide. Release remains NO-GO while real npm, build, database and browser tests are outstanding.
