# AssetTrust v0.85 — Security and Release Report

**Release decision: NO-GO — source-development checkpoint only.**

## Threats addressed

**Unintended development exposure:** Both Vite servers and the development API previously bound to public interfaces by default. v85 uses loopback for default API, browser dev and browser preview. The API rejects development all-interface bindings without a separate explicit flag. Production retains the private-proxy requirement; the test API remains pinned to loopback.

**Build provenance tampering:** The v68 supervisor originally tracked the root package and authentic lockfile, but a postinstall script could mutate application TypeScript, SQL or workspace files without changing either tracked file. v85 captures a sorted SHA-256 snapshot of backend/frontend sources, all 27 SQL migrations, package manifests, deployment scripts, CI and build tooling **in memory** before any npm subprocess. The supervisor fails after a command if the fingerprint changes, or if a protected path is unsafe. The original lockfile and compiled-output checks remain active.

## Tests

- New suite: **43/43 passed**, including synthetic postinstall/compile source mutation, symlinks, bad binds, positive/negative bind authorization and genuine no-approval build path.
- Regression matrix: **45/45 suites v41-v85**, **915 counted passes**.
- Static architecture, syntax, imports, CI and limited snapshot secret scanner: passed.
- Unchanged 27 migration scripts verified by byte comparison with v0.84 archive.

## Remaining major blockers

1. The authentic `package-lock.json` and installed package dependencies are absent, and the npm registry returns `EAI_AGAIN`. `npm run build` **failed** on unresolved packages/Node definitions. No actual API or frontend bundle was built.
2. No live PostgreSQL, PostGIS, restricted runtime role, authenticated HTTP/browser test, mail workflow, ClamAV threat-verdict or real concurrency test was executed in this environment.
3. The ZIP has no `.git` history. Whole-history credential scanning and independent penetration testing are outstanding. The snapshot scanner is narrow and is **not** an independent audit.
4. Source fingerprinting protects the supervised local build only. It does not prove dependency authenticity, prevent malicious code in a reviewed lockfile, or attest to published runtime images. CI unit tests prove the control; a real supervised CI/Kali run still must be performed.
5. Production readiness requires the cross-project mandatory release gate: TLS, SSH network restrictions, Argon2id, MFA, CSRF, cookies, rate limiting, tenant isolation, immutable audit, malware-scanned bounded uploads, authorization, payment integrity, real deployment and disaster recovery.

**Do not distribute or deploy as a certified release.**
