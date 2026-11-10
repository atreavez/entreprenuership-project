# AssetTrust v0.3 — Actual check evidence (6 Nov 2026)

The following checks were run in the artifact creation environment against the v0.3 source tree, without access to a running PostgreSQL instance or the npm registry.

| Check | Result | Evidence / limitation |
|---|---|---|
| `npm run smoke:offline` | PASS | Sequential stage changes, old professional role checks, invitation expiry, due dates, local integrity helper. Uses lightweight mocks. |
| `npm run verify:v03` | PASS — 17 checks | Compiles and executes the actual pure stage review policy in a sandbox. Includes self-review, rejected/accepted, wrong-stage and accredited role cases; also confirms API/SQL hooks. |
| TypeScript transpilation syntax | PASS — 25 `.ts` / `.tsx` files | `transpileModule` parse only; not complete TypeScript typechecking. |
| `node --check` on test and preview scripts | PASS | JavaScript parsing, not runtime integration. |
| Source-based HTML rendering | PASS for 20 views | The project-specific static renderer translates the app TSX components using fictional data; it is not a production React runtime. |
| Chromium screenshots | PASS — case detail 1440px, 390px | No `document.documentElement.scrollWidth > window.innerWidth` detected at tested widths. Does not establish device compatibility or accessibility. |
| `npm test` | BLOCKED | `ts-node/register` and other project dependencies unavailable in this environment. |
| `npm run build` | BLOCKED | TypeScript cannot find missing Node type declarations; npm packages are not installed. |
| PostgreSQL migration / HTTP e2e | NOT RUN | No PostgreSQL server or Docker; npm registry DNS lookup failed (`EAI_AGAIN`). |
| CI workflow | NOT RUN | YAML included under `.github/workflows/ci.yml`, pending actual repository execution. |

**Decision:** v0.3 is a source checkpoint for local testing and further development, not a verified running deployment. Do not use the `PASS` statuses above to imply a live API or successful production build.
