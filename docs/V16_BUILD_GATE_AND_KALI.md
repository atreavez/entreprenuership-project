# v0.16 Build and integration runbook

## On an internet-connected Kali Linux development machine

1. Install Node.js 22+ and Docker Engine/Compose.
2. Run `npm install` at the project root **once** to generate `package-lock.json`. Review the lockfile for changes and commit it. Do not invent a lockfile by hand.
3. Run `npm ci` to confirm the dependency graph can be recreated cleanly.
4. Run `npm run release:gate`, `npm run verify:v16`, `npm run verify:architecture`, `npm run verify:syntax`, `npm test`, then `npm run build`.
5. Create a **new disposable** PostGIS database. Configure dedicated test secrets and an explicitly disposable database URI; never use a production database.
6. Run `npm run db:migrate`, `npm run db:check`, and the supervised integration suite according to `docs/V15_RUNBOOK.md`.
7. Examine test output before setting a deployment status.

## Separation of concerns
- DDD: no changes to domain policies in this checkpoint.
- TDD: policy tests exercise fail-closed release gates.
- SOLID/Clean Architecture: release policy is a small pure module; command-line IO is in a separate adapter.
- Security by design: CI must fail when lockfiles, migration checks, or supervised HTTP tests are missing.

## Evidence
This workspace can execute offline Node tests. npm installation and live PostGIS integration could not be verified. The strict release gate is expected to fail until a valid generated lockfile is added.
