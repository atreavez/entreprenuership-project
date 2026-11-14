# AssetTrust v0.71 — Security and Release Report

**12 November 2026 · NO-GO for production**

## Scope

Added one explicit, ordered, fail-closed supervisor for the existing disposable Kali integration workflow. The owner-only evidence report records first failure, safe exit codes and bounded error categories without retaining child stdout/stderr, database URLs, JWTs, MFA keys, API tokens or user/asset identifiers. Private evidence file is `0600`; private directories `0700`. Symlinks or unsafe permission bits are rejected, and existing reports are never overwritten. The npm build stage strips confidential values, integration confirmations and mutation opt-ins.

The supervisor requires a real v0.68 build-acceptance evidence record, all six successful build stages, consistent v0.71 source/lockfile hashes and compiled artifact integrity, before doing any database mutation. It then uses the pre-existing v0.70 guarded PostGIS/ClamAV, migrations, nonowner role and identity-bound authenticated tests. A passing local test suite never generates a production approval.

## Verified here

- v0.71 new tests: **21/21 pass**, including fail-fast negative tests, missing/tampered build provenance, credential protection, order, symlink and permission rejection, existing runtime role reuse, and fake successful child rejection.
- v0.41–v0.71 regression scripts: **31/31 pass**, **503 counted TAP cases** in the final runs.
- Architecture, source syntax, source graph and CI workflow checks passed.
- Limited current-source secret patterns: **0 high-confidence matches / 3,265 files**. This is not an original-Git-history scan.
- Read-only build inspection correctly identifies absent reviewed lockfile. Full TypeScript compilation failed due to missing NestJS and Node dependencies/type declarations.

## Known blockers and residual risks

1. Genuine lockfile, successful npm install, vulnerability audit and compiled backend/frontend are not established in the ZIP.
2. No Docker daemon, PostGIS, ClamAV or authenticated real API was exercised in this environment.
3. The v0.70 Docker Compose project and named database volume are unchanged. Reusing the same volume with newly generated passwords is unsafe operationally; inspect existing fixture ownership before running. No automatic destructive reset is provided.
4. Source-only tests and simulated runners are not substitutes for browser acceptance, real Postgres tenant isolation, MFA, malware threat detection, HTTPS or backup restore.
5. Original `.git` history is absent; complete Git secret scanning, incident review and key rotation where needed remain mandatory.
6. The v0.71 evidence record is not a signed attestation or tamper-proof audit ledger; keep it within controlled test storage and corroborate with CI logs and an independent reviewer.

No migration bytes, RLS policy source, production credentials or user data were altered. **Release verdict: NO-GO.** Final hardening and an independent signed release decision must precede production deployment.
