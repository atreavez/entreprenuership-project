# AssetTrust v0.68 — Security and Release Status

**Assessment date:** 12 November 2026  
**Scope:** v0.68 build orchestration and inherited security controls, offline test evidence.  
**Decision:** **NO-GO** for production.

## New protections

- `--run` refuses production mode and requires an explicit affirmative build-only authorization.
- A genuine, auditable lockfile and unchanged source migration checksums are prerequisites to initiating npm installation.
- npm install/build subprocesses are invoked directly without a shell and without inherited secret/database/authentication credential variable names; their stdout/stderr are not printed to the terminal.
- Lockfile and root package manifest hashes are verified after every build step to detect unauthorized changes introduced by lifecycle scripts.
- Compilation is not treated as complete unless newly created/non-stale API and browser artifacts are verified as real, non-empty, non-symlink files. Existing built browser source-secret checks remain mandatory.
- A first-failure report is stored in a private file and does not grant an automatic deployment or database-security approval.
- CI additionally checks v0.68 unit tests and compiled assets; existing RLS, audit, ClamAV, role, and authorization checks remain in the CI workflow.

## Evidence and limitations

- New tests: 25/25 passed. Recent version-suite regression commands: 28/28 passed. All 27 SQL migration sources unchanged.
- Current-source scanner: no high-confidence matches in 3,073 scanned files. This is **not** a full history scan and does not rule out all secrets.
- The npm registry could not be contacted; the authentic `package-lock.json` and full dependency installation are absent. The full application build is blocked by missing package definitions. No claim of build success is justified.
- No authenticated PostgreSQL/PostGIS, ClamAV, real browser, two-API, adversarial penetration, restored backup, transport TLS, deployment or rollback tests were performed in this environment.
- The build runner reduces but cannot eliminate supply-chain risk from npm lifecycle scripts. Review dependency sources and install scripts before use on a trusted connected host.

## Mandatory final security release gate

The platform requires proven real authentication with Argon2id/bcrypt, protected recovery tokens, MFA and audited admin RBAC, strict cross-tenant query/service/database isolation and FORCE RLS, server-only credentials, parameterized SQL, input validation, CSRF and secure cookies where applicable, HTTPS, restricted SSH, malware-screened uploads and private file storage, rate limiting, payment/price authority checks, disabled production debug, original Git-history scans/secret rotation, dependency audit, backups and rollback rehearsal, integration and browser security tests and a documented independent release verdict.

**No production launch until those checks pass on a real, appropriately isolated deployment environment.**
