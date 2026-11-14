# Changelog — AssetTrust v0.85.0

## Changed

- Safer development defaults: API and Vite dev/preview now listen on `127.0.0.1` unless explicitly reviewed for LAN exposure.
- Added `DEV_PUBLIC_BIND` and `API_BIND_HOST_INVALID` startup preflight errors; all-interface development API binding now requires `ASSETTRUST_ALLOW_LAN_DEV=YES`. Production/test boundary remains separately restricted.
- Improved the existing supervised v68 genuine-build acceptance runner: fingerprints protected source including API/web, SQL, workspace manifests, deployment, services, CI and build tools before any npm command, and halts on any unexpected post-command mutation. Symlink/nonregular injection into a protected tree is rejected. Source snapshot hash/file count are included in local build evidence.
- Added `tools/tests-v85/secure-build-and-bind-v85.test.cjs` (43 passing tests), root `verify:v85` and CI registration.
- Updated earlier v43 and v72 synthetic tests to require the stronger behavior instead of earlier code-pattern/bare-manifest assumptions.
- Maintained the 27 reviewed SQL migrations and all existing platform, tenant and administrator features.

## Still blocked

The archive lacks an authentic npm lockfile and installed NestJS/React dependencies; npm registry resolution failed. Full typecheck/bundle, real PostgreSQL and browser acceptance, full history scanning, dependency vulnerability review and production security gate remain unverified. **NO-GO**.
