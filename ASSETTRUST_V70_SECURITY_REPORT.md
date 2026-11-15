# AssetTrust v0.70 — Security and Release Verdict

**Verdict:** **NO-GO FOR PRODUCTION** — source-only checkpoint with a guarded local integration mechanism.

## Improvements introduced

- The new PostGIS integration service is separate from the existing development database and bound to `127.0.0.1:55432`; a separate optional ClamAV service binds to `127.0.0.1:13310`.
- The local database password is generated from OS CSPRNG entropy and stored in a private owner-only file consumed through `POSTGRES_PASSWORD_FILE` rather than a reusable plaintext Compose default.
- The helper refuses to overwrite existing credentials, uses restrictive local file permissions, rejects symlinks and malformed private configuration, and never echoes credentials or raw subprocess stdout/stderr.
- Docker is invoked explicitly through the **local** Unix socket, preventing an inherited remote Docker context from silently reaching a remote engine.
- The existing migration owner remains separate from a randomly credentialed, non-superuser, non-BYPASSRLS runtime login, provisioned only against the explicitly named loopback disposable database.
- Prior migration checksums and RLS policy predicates are preserved; no code bypasses current MFA, RLS, account throttling, existing admin approval workflows or audit requirements.
- Full HTTP tests require the v0.68 reviewed-lockfile and compiled-artifact provenance gate before starting the supervised test API.
- Only explicit `ASSETTRUST_V70_LOCAL_CONFIRM=YES` in a non-production environment permits live/mutating operations. The project never automatically approves a release.

## Residual risks and release blockers

1. **No authentic npm lockfile in the ZIP** and npm registry unavailable in authoring environment; dependency audit, NestJS API compilation, frontend build, and possible real TypeScript defects remain unverified.
2. **No live PostGIS/ClamAV execution in authoring environment.** Official container initialization and host-specific Docker permissions must be confirmed on Kali. Scanned uploads and fail-closed scanner errors must be exercised using the real daemon.
3. **No live runtime-role and policy-inventory proof yet.** Verify 27 SQL migrations, 16 permitted RLS policies on 13 protected tables, FORCE RLS, runtime role privilege restrictions and cross-organization access with real database credentials.
4. **No genuine HTTP and browser integration results yet.** Run the v0.69 administrator/reviewer authentication journey, session revocation, MFA step-up, two-API readiness, tenant CRUD, geospatial and document workflows, including denied cross-tenant attacks.
5. **No original Git-history security scan.** The limited 3,214-file source scanner is insufficient; scan the original repository's full history and revoke/rotate any leaked credentials.
6. **No production network, TLS, backup/restore, host SSH, disaster recovery or independent adversarial assessment.** Verify all before considering release.

The isolated Compose instance is disposable development infrastructure, **not** a production deployment recommendation. The database operator in the fixture has temporary superuser capabilities needed to apply PostGIS migrations; the API is not permitted to use this account. The private secrets should be discarded after the disposable database is securely decommissioned. Avoid `docker volume prune` or `down -v` unless the exact project ownership and data retention obligations have been verified.

Maintain DDD, TDD, SOLID and Clean Architecture boundaries. Final security gate remains mandatory, including Argon2id/bcrypt, secret isolation, authorization at service/query/DB levels, HTTPS, input validation, rate limits, CSRF and cookie protections, password-reset rules, malware-screened uploads, admin MFA/RBAC/audit, payment integrity, dependency audits, original-history secret scans, full regression/integration/abuse testing, controlled deployment and human acceptance.
