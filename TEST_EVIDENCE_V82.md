# AssetTrust v0.82 — Test Evidence

**Execution:** offline authoring container, 12 November 2026. Source-level and simulation evidence; **not** real PostgreSQL/browser acceptance.

| Validation | Actual observed outcome |
|---|---|
| Initial v0.82 RED tests before patch | FAIL: 22/28 security tests (demonstrating missing role-based/session-bound MFA) |
| Updated v0.82 suite (`npm run verify:v82`) | PASS: **45/45** |
| v0.41–v0.82 version matrix | PASS: **42/42** suites, **815** counted tests, zero failures |
| Earlier auth/step-up suites v18/v19/v20/v27/v29 | PASS with updated SQL/mock expectations for current session binding |
| v0.69 synthetic admin/reviewer acceptance fixture | PASS after adding MFA enrollment and moving no-step-up negative assertion to non-admin privileged writes |
| v0.73 document-grant/revocation synthetic fixture | PASS after adding synthetic admin MFA |
| `npm run verify:architecture` | PASS |
| `npm run verify:syntax` | PASS |
| `npm run build:imports:v80` | PASS |
| `npm run verify:ci:v53` | PASS |
| `npm run build:source:v56` | PASS |
| `tsc --noEmit` on independent coadmin domain | PASS |
| SQL migration digest compare against v0.81 archive | PASS: 27 equal SHA-256 digests |
| Current-source secret scan | PASS: 3,596 scanned files, zero high-confidence matches (not whole-history scan) |
| Full `npm run build` attempt | FAIL: TS2688 missing `@types/node`; TS2307 missing installed NestJS, pg etc. No authentic lockfile or installed dependencies. Not evidence of a validated source compiler defect. |
| `npm run release:preflight:v51` | BLOCKED: authentic `package-lock.json` missing |
| Live PostGIS, ClamAV, production DB role, HTTP, browser | NOT RUN |
| Full Git history / independent adversarial security gate | NOT RUN |

The regression matrix and per-suite offline TAP logs are stored in `test-evidence/v82/`, together with syntax, import, preflight, limited credential scan and build-attempt logs. No E2E database test was represented as successful by the authoring environment. No real production credential was generated or included in the ZIP.

**Release decision: NO-GO.**
