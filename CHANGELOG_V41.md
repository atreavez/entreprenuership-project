# AssetTrust v0.41 — CI and deployment-readiness gates

**11 November 2026 · Engineering checkpoint · NOT PRODUCTION READY**

- Corrected inherited GitHub Actions workflow coverage from v0.35 to the complete v0.03–v0.41 offline version matrix.
- Added an automated, dependency-free CI contract that derives all version and PostgreSQL integration scripts from `package.json` and fails if any are missing from CI, if CI ignores failures, or if it replaces `npm ci` with `npm install`.
- Added a new separate, opt-in, localhost/disposable-only two-PostgreSQL-session shared failed-credential counter contract. It applies unchanged migration 018 to an isolated, random test schema and drops it after the test; it is **not** a two-application-server test.
- Added a read-only prerequisite inspector, without production approval claims.
- Added 9 focused tests, architecture and operator documentation, reproducible regression logs and truthful blocked release evidence.
- Updated package versions to 0.41.0. **No new schema migrations or application-domain changes.** Existing 18 migration fingerprints unchanged.

The archive does **not** include a lockfile, dependencies, actual database test success or browser test success, because these could not be obtained in the sandbox. Run the Kali guide on a trusted, connected developer host to continue the release gates.
