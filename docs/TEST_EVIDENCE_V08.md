# AssetTrust v0.8 — Test Evidence and Release Gates

**Compiled by Aturinzire Hargreave · 7 November 2026**

## RED → GREEN implementation evidence

- Before the domain module was implemented, the v0.8 parcel-domain test command failed **7** of its **9** checks because the target module was absent. This was the intentional RED stage.
- The first GREEN run passed **9/9** domain validation/review tests after implementing the domain rules.
- Application tests added afterward passed **6/6** after correcting two test-harness assumptions about synchronous exception behavior.
- Final `npm run verify:v08` passed **15/15** tests and an isolated strict TypeScript typecheck for the domain and application use cases.

## Offline checks executed

| Command | Observed result |
|---|---|
| `npm run verify:v08` | Passed 15/15 and strict isolated typecheck |
| `npm run verify:v07` | Passed 15/15 encrypted document storage tests |
| `npm run verify:v06` | Passed offline professional trust checks |
| `npm run verify:v05` | Passed 21/21 identity/security tests |
| `npm run verify:v04` | Passed offline architectural checks |
| `npm run verify:v03` | Passed 17/17 offline evidence policy/structural checks |
| `npm run verify:syntax` | 46 TS/TSX files transpile without syntax diagnostics |
| `npm run smoke:offline` | Passed workflow, invitation expiry and local audit policy checks |
| Desktop static preview at 1440px | Rendered from source, no horizontal overflow |
| Mobile static preview at 390px | Rendered from source, no horizontal overflow |
| `npm run build` | **Failed before compilation**: missing `@types/node` (dependencies not installed) |
| PostGIS migration and HTTP live integration | **NOT RUN** (PostgreSQL/Docker unavailable) |
| Independent security assessment | **NOT RUN** |

Logs of the available offline checks are in `test-evidence/`. The frontend screenshots were created from the TSX source with a constrained offline element renderer, **not** an installed React runtime. The renderer does not test event handling, network requests or authenticated UI state.

## Critical staging release gates

1. Full `npm install`, `npm test`, `npm run build` must pass; resolve any TypeScript errors.
2. Fresh and upgraded PostgreSQL 17 + PostGIS schema migrations must pass. Confirm geometry validity, indexes and constraints.
3. Execute the `test:e2e:geo` workflow on a disposable local database, including cross-organization denial and unaccredited review denial.
4. Test concurrent surveyors attempting to accept different claims for the same asset; verify atomic superseding and audit integrity.
5. Validate user-level asset grants, session expiry, current accreditation expiry/revocation and recent MFA.
6. Add malware/quarantine controls to the legacy vault, file scanning and production monitoring/backup recovery.
7. Commission qualified survey and legal review; do not imply formal registration or government authorization.
8. Ensure compliant OSM-derived tile licensing and attribution once self-hosted maps are added.

**Release decision: Development checkpoint only. Not approved for production.**
