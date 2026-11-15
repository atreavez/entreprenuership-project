# AssetTrust v0.86 — Engineering Handover

**Milestone:** Build-to-live source and compiled-output integrity. Root/API/web versions: `0.86.0`. Continued from the complete v0.85 checkpoint. **Development checkpoint only; production NO-GO.**

## Implemented in the application repository

1. `tools/build-acceptance-v68.cjs`: a new `compiledOutputSnapshot()` records SHA-256 over every regular file emitted under `apps/api/dist` and `apps/web/dist`, not merely the main entrypoints. The v0.86 supervised-build evidence includes the complete-output digest and file count, in addition to the v0.85 reviewed-source digest, lockfile digest, validated generated files and all seven ordered command results. The snapshot refuses symlinks, nonregular files, missing entrypoints and oversized individual compiled files. It does not run against a real server during offline unit tests.
2. `tools/acceptance-provenance-v86.cjs`: independent read-only verifier checks that the **current** root/API/web versions, root manifest and lockfile digests, protected-source SHA-256, complete compiled-output SHA-256, actual artifact policy, and seven completed build steps match the inspected build record. It fails closed on a missing/unsafe record, changed API or web code, SQL, CI policies, unexpected JS/CSS output, or an altered step result. No network, shell, database access or credential disclosure.
3. `tools/kali-acceptance-v71.cjs`: disposable Kali acceptance now enforces the strict v0.86 provenance verifier whenever package version is >=0.86. Older v71/v72 historical test fixtures retain their original version-specific contract, but **v0.86 cannot fall back to it**.
4. `.github/workflows/ci.yml`: after normal artifact compilation, CI performs the reviewed supervised build (`ASSETTRUST_V68_BUILD_CONFIRM=YES`) and inspects the complete v0.86 provenance before database migrations and live integration stages. All predecessor offline suites plus `verify:v86` run in CI.
5. `tools/tests-v86/complete-build-provenance-v86.test.cjs`: **34/34** synthetic filesystem/process regression tests. They compare acceptable untouched synthetic build evidence to altered API/web source, SQL, tools, CI, lockfile, emitted JS/CSS, new/removed/symlinked output, and incomplete/forged build records. Synthetic runners are not real npm installs or real typechecked builds.
6. Root and workspace manifests bumped to 0.86.0 and new scripts registered: `verify:v86`, `acceptance:provenance:plan:v86`, `acceptance:provenance:inspect:v86`.

## Verification performed in this environment

- **46/46** suites `v41`–`v86` passed; **949** counted TAP cases. Individual logs and machine-readable matrices are under `test-evidence/v86/`. New v86 suite: **34/34 passing**.
- `npm run verify:architecture`, `npm run verify:syntax`, `npm run build:imports:v80`, and versioned CI policy checks passed. TypeScript syntax/transpilation is **not** a real dependency-backed build.
- Source-level secret snapshot scan passed (3867 files when measured; zero high-confidence matches). `npm run security:scan:v54` correctly refused release because original `.git` history is unavailable. A full independent scan is still outstanding.
- **All 27 SQL migrations byte-for-byte unchanged** from v0.85. No PostgreSQL schema, tenant RLS contract, MFA/business workflow or production payment behavior was modified in this milestone.
- `npm run build` **FAILED**: missing Node/NestJS packages/type declarations. The genuine `package-lock.json` is absent, npm registry DNS reported `EAI_AGAIN`, and local PostgreSQL/PostGIS/Docker is unavailable. `npm run release:preflight:v51` and `npm run acceptance:provenance:inspect:v86` therefore **BLOCK** as intended. No live API, MFA, workflow, concurrency or browser tests were run here.

## On a trusted connected Kali development host

```bash
npm run verify:v86
npm run verify:architecture
npm run verify:syntax
npm run build:imports:v80
npm run acceptance:provenance:plan:v86
# If there is NO authentic lockfile, generate it only through the reviewed project script:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
# The supervisor re-installs, audits, builds, checks every source and artifact:
ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
# Must show ok:true BEFORE any disposable live acceptance:
npm run acceptance:provenance:inspect:v86
```

**Do not overwrite an existing reviewed lockfile, run npm lifecycle scripts with production secrets, or point local integration at customer databases.** Inspect `test-evidence/v68/build-acceptance.json` locally; do not publish private logs.

Next run `npm run kali:acceptance:plan:v73` and follow `V86_KALI_VALIDATION.md` for disposable local PostgreSQL/PostGIS and restricted non-BYPASSRLS role. Run authenticated MFA, tenant isolation, dispute, payments, uploads/ClamAV and browser acceptance, recording exact commands and failures. Production approval remains a separate security and release decision.

## Limitations

The recorded hashes prove **internal consistency of files and a local build report**, not a cryptographically signed build, independent third-party attestation, trust in the build host, a reproducible binary, or a successfully running application. Anyone with arbitrary write control of the build host might alter both files and reports. The remaining mandatory security-release gate includes real installations, original Git-history scans and rotations, external vulnerability assessment, TLS/SSH controls, payments, tenant isolation, rollback and backup restore.
