# AssetTrust v0.85 — Engineering Handover

**Milestone:** Supervised build-source integrity and loopback-safe local runtime. Version `0.85.0` of the complete source tree, continuing v0.84. **This is not a production build or approval.**

## Actual implementation

1. `tools/build-acceptance-v68.cjs`: new `sourceSnapshot()` computes sorted SHA-256 entries for the reviewed root/workspace manifests, NestJS and React application source, 27 migration scripts, both TypeScript configurations, browser entry/Vite configuration, tooling, deploy and mapping-service code, and CI workflow. Its combined SHA-256 is held **in the supervising process's memory**. After **every successful npm step**, the supervisor rechecks the protected source snapshot. A changed, deleted, or symlink-substituted source file causes immediate `PROTECTED_SOURCE_CHANGED:<step>` or `PROTECTED_SOURCE_INVALID:<step>` and aborts before the next command. It also preserves the existing separately checked authentic lockfile, fresh compiled output requirement, audit gates, restricted environment, private build evidence, and non-production opt-in.
2. `apps/api/src/contexts/platform/domain/runtime-config.ts`: development API binds to `127.0.0.1` by default. Explicit `0.0.0.0`/`::` binds in development require `ASSETTRUST_ALLOW_LAN_DEV=YES`, while production public binds still require `ASSETTRUST_PRIVATE_PROXY_NETWORK=YES`. Tests continue to bind loopback. Unknown or malformed bind hosts are rejected. Validating startup and choosing listener host share this framework-independent policy.
3. `apps/web/package.json` and `apps/web/vite.config.ts`: Vite development and preview bind loopback by default. The operator must intentionally override the binding to share a dev server outside the local machine.
4. `tools/tests-v85/secure-build-and-bind-v85.test.cjs`: 43 new passing tests against the actual compiled runtime policy and the production supervisor function using synthetic filesystem and process fixtures. Includes postinstall tampering of backend/frontend files, SQL, workspace dependencies, tooling, deploy manifests and workflow, and proof that normal compiled-output changes are not mistaken for source tampering.
5. Root and workspace version bump; `.github/workflows/ci.yml` registers `verify:v85`; an older v43 and v72 test fixture is updated to verify stronger behavior without relaxing the underlying authorization or migration contracts.

## Verification actually performed

- **45/45** completed offline regression suites, `v41`–`v85`; **915 passing** counted TAP cases. Logs: `test-evidence/v85/version-suites/` and matrix `test-evidence/v85/regression-matrix.json`.
- New v85 suite: **43/43 passing**.
- Architecture, TypeScript **syntax-only** transpilation (109 TS/TSX), source import contract, CI static policy/YAML and local source secret scan all passed. These are **not** typechecking, npm vulnerability audit, or live authorization results.
- All **27 SQL migrations are byte-for-byte unchanged** from v0.84.
- Attempted `npm run build`: **FAILED**, unresolved NestJS packages and Node type declarations due to no `node_modules` / dependency installation. `npm view` registry access failed with `EAI_AGAIN`. Authentic `package-lock.json` is absent. Do not forge or hand-author a lockfile.
- No PostgreSQL/PostGIS service or browser automation used; no authenticated API, real PostgreSQL concurrency, upload malware, payment or multi-tenant live test executed. The original Git history is absent, so history scanning is incomplete.

## Build on a connected trusted Kali workstation

```bash
npm run verify:v85
npm run verify:architecture
npm run build:source:v56
npm run build:imports:v80
npm run lockfile:check:v55
# Fresh archive only, if the lockfile does not exist; review generated lockfile:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run build:acceptance:inspect:v68
ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
```

The supervised `--run` performs `npm ci`, production-dependency audit, full API + web compilation, compiled artifact policy and latest offline regression. It writes private evidence in `test-evidence/v68/build-acceptance.json` and returns nonzero on any failure. **A successful build only reaches `BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED`; it is not a production release approval.** Follow `V85_KALI_VALIDATION.md` for real database and security gates.

## Security and release position

No RLS policy or immutable migration was changed. The source-fingerprint control guards the supervised build only; it is not independent third-party attestation, and does not prove all native postinstall scripts or dependencies are safe. **NO-GO** pending reviewed lockfile, genuine dependency-backed build, independent vulnerability and secret-history scans, real restricted-role PostGIS tests, HTTP/browser acceptance and full final security release gate.
