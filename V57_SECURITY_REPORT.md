# ASSETTRUST v0.57 - SECURITY AND RELEASE VERDICT

**Release decision: NO-GO** | 11 November 2026

## Security finding addressed

CI previously ran real HTTP API smoke processes using the disposable PostgreSQL operator connection. That login was configured as the Postgres service superuser. PostgreSQL superusers bypass RLS even with `FORCE ROW LEVEL SECURITY`, so a successful API test under that connection would not prove effective tenant isolation. Individual RLS contracts used restricted roles, but the actual API processes did not.

## Implemented mitigation

v0.57 provisions a separate CI-only runtime login with NO SUPERUSER, NO BYPASSRLS, NO CREATEROLE and NO CREATEDB privileges, and retains the operator account solely for migrations and integration fixture setup. The spawned API processes must use that runtime URL. The existing seven-table RLS/role startup check now runs in enforced CI test mode. A new live test contract checks that the current role is nonprivileged, is not an RLS table owner, has all seven RLS tables FORCE-enabled, and sees no unscoped tenant records.

**Risk and scope caveat:** the new CI runtime role is granted ordinary DML over all public tables to run the existing integration workflows. These grants are broader than production least privilege and must not be reused as a production grant model. More private tables still lack RLS. A custom tenant setting alone is not a substitute for server-side authorization or robust SQL-injection prevention.

## Recorded verification

- New v0.57 policy tests: **20/20 passed**.
- Historical + current version suites v0.03-v0.57: **55/55 passed** across recorded runs (the first monolithic batch was interrupted; remaining suites completed in smaller batches).
- Source graph, TypeScript syntax, architecture, CI semantic/YAML and offline smoke checks: passed.
- Existing migrations: **25/25 SQL files byte-for-byte identical to v0.56**.
- Current-source secret scan: passed, 2,467 files, zero high-confidence matches; not full Git history.

## Blocked or unverified

- npm registry DNS failed (EAI_AGAIN), `package-lock.json` missing; `npm ci` blocked.
- API build failed due to missing installed TypeScript/Node/NestJS/pg dependencies. Other compile errors could remain after dependencies are installed.
- No PostgreSQL server in this environment: new live role contract, migrations, RLS, and real two-API tests unexecuted.
- Actual ClamAV, Git-history secret review, browser integration, external vulnerability scan, backups and recovery, HTTPS/reverse-proxy hardening, and adversarial security review remain unverified.
- A restricted CI test account is not proof of safe production account grants.

## Required release gates

Use a connected Kali environment or an isolated CI runner, add and review a genuine lockfile, run `npm ci`, `npm audit --omit=dev --audit-level=high`, and complete real builds. Use a disposable `assettrust_ci`/`assettrust_test` PostgreSQL database, run migrations, provision and inspect the restricted CI role, then run RLS and owned HTTP integration suites. Record signed/hashed evidence, fix critical findings, scan all Git history and rotate actual exposed secrets, and verify production network, TLS, SSH, uploads and administrative authorization. Release remains blocked until all critical findings resolve.
