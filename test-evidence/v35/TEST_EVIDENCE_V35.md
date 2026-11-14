# AssetTrust v0.35 — Executed Test Evidence (Source Workspace)

## Verified

- **16/16** new v0.35 domain/service/static migration tests PASS (`verify-v35.log`).
- **33/33** offline version checks `verify:v03` through `verify:v35` passed in individual executions (logs `verify-v03.log` … `verify-v35.log`). Older version tests that erroneously required exactly 14 SQL migrations were made forward-compatible; original SQL fingerprints were not changed.
- Architecture suite PASS (`architecture.log`), 82 TS/TSX source files with 0 **syntax-only** diagnostics (`syntax.log`).
- Migration plan successfully enumerates 15 ordered SQL migrations.
- Earlier RED for the new withdrawal domain test: three failures before implementation (`RED-withdrawal-policy.log`). GREEN after implementation.
- Offline domain smoke PASS (`smoke.log`).
- New PostgreSQL contract script parses (`node --check`) and refuses to start without disposable-database mutation authorization (`pg-gate-no-target.log`).

## Not verified / release BLOCKED

- `npm ci` could not run because a real committed dependency lockfile was not present; network-based genuine dependency resolution was not performed here (`npm-ci-attempt.log`).
- `npm run build` did not pass because NestJS, pg and other dependencies were not installed (`build-attempt.log`).
- Existing workspace `npm test` failed module resolution (not an observed application assertion failure): missing `@nestjs/common`, `pg` etc (`npm-test.log`).
- No live PostgreSQL/PostGIS migration execution, no authenticated HTTP integration, no actual React browser E2E, and no deployment/pentesting.

**Decision:** OFFLINE-TESTED SOURCE CHECKPOINT ONLY. NOT READY FOR PRODUCTION.
