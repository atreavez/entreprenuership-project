# AssetTrust v0.80 — Dependency Declaration and Build-Path Remediation

**Checkpoint date:** 12 November 2026  
**Source:** v0.79 complete checkpoint  
**Outcome:** Source-level milestone delivered; **production release NO-GO**.

## What changed

1. **Declared the API's direct Express dependency.** The backend source imports types from `express` in `auth.ts`, `documents.ts`, and the password-reset controller. `apps/api/package.json` previously declared `@types/express` but not `express` itself, relying on NestJS transitive installation. v0.80 explicitly declares `express: ^5.1.0`, pending genuine lockfile resolution and compatibility testing on a connected machine. The three Express imports now use `import type` to avoid producing unnecessary runtime imports.
2. **New dependency-boundary tool.** `tools/direct-dependency-policy-v80.cjs` audits API and web TS/TSX/JS source import declarations, side-effect imports, literal dynamic imports, and `require` calls. It understands scoped packages and Node built-ins and allows build-only packages in the Vite configuration. For application source, packages must be **direct production dependencies in their own workspace**, not dev dependencies or transitive dependencies. It fails closed on symlinked, unreadable, or unsafe source trees. It does not use npm or network resources.
3. **Pre-install CI check.** `npm run build:imports:v80` executes before `npm ci`, and the new `npm run verify:v80` is included in the existing CI matrix. The previously reviewed lockfile and YAML-policy security gates are not bypassed.
4. **Source tests.** 17 new tests exercise direct dependency declarations, scoped imports, type-only imports, workspace isolation, config-only packages, symlink rejection, comments/JSX false positives, and CI sequencing. Older version fixture assertions were made forward-compatible **without removing their permission/isolation assertions**.
5. **Versioning and handover.** Three workspace package versions set to `0.80.0`; the original API/web source, admin console and previous functionality are retained. No SQL migrations were changed.

## Verified in the available execution environment

| Check | Result |
|---|---|
| New `verify:v80` suite | PASS: 17/17 cases |
| Historical version regression matrix v0.41–v0.80 | PASS: 40/40 suites, 735 counted TAP passes, no failures |
| Direct-import audit | PASS: 113 import occurrences, 18 distinct workspace-package pairs |
| Vite/local import checks (`build:source:v56`) | PASS |
| Architecture and TypeScript **syntax-only** preflight | PASS |
| YAML/CI policy validator | PASS: 78 version-suite scripts and 33 PostgreSQL contract scripts |
| SQL migration comparison against v0.79 | 27/27 byte-for-byte unchanged |
| High-confidence current-source secret scanner | PASS: 3,540 files, 0 reported matches; **limited scan** |
| Authentic npm lockfile | ABSENT — blocked |
| Registry resolution (`npm ping`) | FAIL: DNS `EAI_AGAIN registry.npmjs.org` |
| Dependency-backed API/web compilation | FAIL: missing installed `@nestjs/common`, `pg`, `@types/node`, etc. Not a valid typecheck of the finished dependency graph |
| Real PostgreSQL, HTTP, browser, admin MFA and backup/restore tests | NOT EXECUTED |
| Full Git-history secret scan | NOT EXECUTED (`.git` history not included in distributed ZIP) |
| Production security/release gate | **NO-GO** |

## What the new check does not prove

It only checks syntactically identifiable **literal module specifiers**. It cannot inspect dynamic computed imports, dependency runtime compatibility, peer resolution, transitive vulnerability state, TypeScript semantic types, or real application behavior. The new Express version must be resolved and reviewed with an **authentic npm lockfile**. The absence of a lockfile is never interpreted as permission to disable lockfile validation or dependency audits.

## Important Kali follow-through

Extract the checkpoint into a clean folder on trusted connected Kali, and run:

```bash
npm run build:imports:v80
npm run verify:v80
npm run verify:architecture
npm run verify:syntax
```

If and only if **no** `package-lock.json` exists in the clean extract, generate a genuine lockfile with the existing explicitly guarded tool:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
```

Review new package sources, the exact Express/Nest resolved versions, transitive install scripts, and all npm audit findings. If a trusted existing lockfile is present, **do not silently overwrite it**: reconcile and review the dependency change through the project's established lockfile process before `npm ci`.

Next run the v0.70/v0.71 disposable integration with a restricted non-owner role, and the v0.73–v0.78 live DB security and concurrency checks. Run authenticated administrator and organization flows, independent final security gates, and full Git-history scans before approving deployment. Record the **first genuine compiler error** after installation; fix it in source and rerun the full pipeline. This milestone does not claim that those checks passed.
