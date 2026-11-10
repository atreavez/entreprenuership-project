# AssetTrust v0.15 — Fresh-instance integration supervision

**Compiled by Aturinzire Hargreave · 7 November 2026**

This version extends v0.14 without introducing a new product feature or database migration. The engineering baseline remains DDD, TDD, SOLID, Clean Architecture and security-by-design.

## Implemented

1. **Fresh per-run instance identity:** The supervised API and all HTTP test children receive a cryptographically generated 192-bit instance marker. The CI job also generates a fresh initial marker; no fixed marker is committed to the workflow.
2. **Early abort for dead API processes:** Readiness polling stops when its supervised child has exited. The owner check precedes database/PostGIS readiness.
3. **Strict CI preflight:** A missing pair of instance identity values is now rejected rather than comparing equal as `undefined`.
4. **Loopback-only test API:** When `NODE_ENV=test`, NestJS listens on `127.0.0.1`, not `0.0.0.0`.
5. **Actual localhost test:** A tiny HTTP server verifies that a matching new marker passes while an old or unrelated marker is rejected. No PostgreSQL or external dependency is used in this test.
6. **CI regression wiring:** The workflow executes the v0.15 suite alongside previous suites.

## Risk and limitations

- Source, policy and local HTTP checks are not equivalent to a built NestJS runtime against PostgreSQL.
- npm dependencies cannot be installed here: outbound DNS to registry.npmjs.org fails and the package cache does not contain the required application packages.
- `npm run build` still fails with `TS2688` (missing `@types/node`). This is an environment/dependency blocker, not evidence that the remaining code typechecks.
- No `package-lock.json` is present. Generate and review it on a connected machine, commit it, then use `npm ci` in CI.
- Live database migrations, end-to-end HTTP tests against NestJS, MapLibre browser tests and a full security review remain **NOT VERIFIED**.

**Release decision: NO-GO for production.** See `docs/V15_RUNBOOK.md` and `docs/TEST_EVIDENCE_V15.md`.
