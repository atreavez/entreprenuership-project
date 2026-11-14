# AssetTrust v0.86 — Security and Release Assessment

**Decision: NO-GO for production.** This checkpoint is restricted to development and offline integrity verification.

### Risk addressed

In prior build acceptance, the supervisor checked and recorded a SHA-256 fingerprint of all reviewed source files, but the downstream Kali acceptance evidence reviewer primarily checked command names, manifest digest and lockfile digest. It did not compare the protected source fingerprint, and it did not authenticate every emitted API and browser runtime file. Thus, a modified source file or nested compiled JS/CSS artifact could survive the older review without invalidating the stored build claim.

### Implemented control

The supervised v0.86 build records a complete-output digest after all build steps. A separate read-only verifier rehashes protected backend/frontend/SQL/configuration/tooling source and **all** emitted API/browser files, verifies 7 successful ordered steps, current workspace version, original package/lock SHA-256, entrypoint hashes and compiled-artifact policy. The v71 Kali acceptance entrypoint and CI require this verifier before subsequent live acceptance. Symlinks, nonregular outputs, missing evidence, and tampered records fail closed. Historic fixture compatibility does not permit the current release to bypass stricter rules.

### Verified evidence

- New provenance tests: **34/34 PASS**, using synthetic builds and tampering fixtures.
- Complete historical offline regression: **46/46 suites**, **949 passing TAP cases**.
- Architecture, TypeScript transpilation/syntax, direct dependency/source-import and CI policy checks: PASS.
- Source secret snapshot scan: PASS, 3867 scanned files with no high-confidence matches. This is not a comprehensive credential or malware audit.
- SQL migrations: 27, byte-for-byte unchanged from v0.85.

### Mandatory outstanding blockers

1. Real authenticated npm dependency graph and `package-lock.json`: unavailable in archive; registry `EAI_AGAIN` prevented installation. No real API/web compilation completed here.
2. Live restricted-role PostgreSQL/PostGIS, real HTTP/MFA/browser, document/upload, disputes and financial tests: **not performed**.
3. Original `.git` history absent; full secret-history scan and any required key rotation remain pending. A truncated archive snapshot scan cannot substitute.
4. No independent source provenance signatures, secure CI identity, SBOM verification, production TLS/SSH/network test, backup restoration, rollback or independent penetration assessment.
5. Ensure existing enforced MFA, current database authorization and transaction/tenant boundaries still pass integration tests on connected Kali. Do not claim source-level tests establish real production behavior.

### Recommendation

First complete the connected Kali supervised build and obtain `npm run acceptance:provenance:inspect:v86` with `ok:true`, then run disposable PostgreSQL/HTTP/browser verification and the separate mandatory release-security gate. This checkpoint alone **must not be deployed to production**.
