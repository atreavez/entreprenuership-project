# AssetTrust v0.87 — Security Review

**Gate:** **NO-GO for production**. This checkpoint improves **integrity of the disposable acceptance chain**, but does not validate deployment, live tenancy, actual payments, or browser functionality.

## What is hardened

The v0.86 provenance verifier already bound seven build steps, a root lockfile, protected source and all compiled outputs. The v0.87 `kali-acceptance-v71.cjs` runner now reuses these checks **before and after each live child command** as well as at stage boundaries. Failure/exception blocks subsequent commands with a safe `BUILD_INTEGRITY_DRIFT` marker; no raw command output or passwords are persisted in the private evidence report. Existing v0.71–v0.86 historical fixture semantics remain versioned and v0.87 cannot downgrade to them.

A final build-to-live provenance check was added to CI after its actual database and HTTP test steps. The v0.86 tests were fixed to permit genuine successful build evidence on Kali without assuming the archive must always lack it.

## Verified offline

- 30 v0.87 tests passed; 27 of 30 fail on the unchanged v0.86 supervisor. All 47 historical suites passed (979 TAP cases).
- Architecture, syntax, source-import policy, Ruby CI policy and source contract passed.
- Existing 27 SQL migration files remain identical.
- Limited high-confidence snapshot scan passed, with no findings in the scanned source. **This does not prove that secrets are absent**.

## Outstanding critical release blockers

1. **NO genuine dependency-backed build**: root lockfile missing; real `npm run build` failed because Node/NestJS packages are absent; registry lookup failed. Cannot claim working frontend/API.
2. **NO real PostGIS/PostgreSQL tests** on this host, including concurrency, tenant row-level security, MFA sessions, disputes, and financial records.
3. **NO original Git-history secret scan**, rotation assessment, independent scanner, or live vulnerability audit.
4. **NO ClamAV, upload quarantine, signed PDF, HTTP/browser, HTTPS/SSH, backup restore, or rolling deployment acceptance results** in this milestone.
5. **LOCAL file hashes are not a cryptographic signature**: a malicious build-host administrator can forge both source and evidence. A process can change a file during a child invocation and restore it before the post-invocation check; this design is a checkpoint guard, not runtime file-system monitoring.
6. The reviewer was tested using synthetic fixture files and stubbed subprocesses. **Do not infer successful live acceptance from the offline test count.**

**Release gate:** Verify authentic compile, real restricted-role database/HTTP/browser operation, server-side payment and tenant authorization, MFA and upload controls, Git history, dependency audit, backup/restore and deployment security before approving a release. The complete cross-project final security standard remains in force.
