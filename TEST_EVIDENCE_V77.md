# AssetTrust v0.77 — Test evidence

Execution date: 12 November 2026. Tools: local Node.js 22.16, npm, TypeScript global transpilation. This environment has **no installed project npm dependencies, real PostgreSQL, or Docker**.

| Validation | Observed | Interpretation |
|---|---:|---|
| `npm run verify:v77` | PASS 34/34 | 22 source/behavior tests + 12 private Kali-runner safety tests |
| Baseline RED against unmodified v0.76 (`ASSETTRUST_V77_TEST_ROOT=...`) | 6 pass, 16 fail | 16 new tests demonstrate behavior absent from old source |
| v0.41–v0.77 version script matrix | PASS 37/37 | 36 passed in full batch; v0.75 subsequently passed after its compatibility fixture was updated |
| Sum of TAP passes across the 37 suite results | 665 | Includes repeated/historical unit and contract tests; NOT real E2E counts |
| `npm run verify:architecture` | PASS 3/3 | Static architecture rules |
| `npm run verify:syntax` | PASS 108 modules | Transpilation only; not API/web compilation |
| `npm run verify:ci:v53` | PASS | 75 version scripts and 32 PostgreSQL contract references |
| `npm run security:scan:v43` | PASS, 3,517 files | Current-source limited-pattern scan; NOT history |
| `npm run lockfile:check:v55` | FAIL/BLOCKED | Authentic `package-lock.json` missing |
| `npm run release:preflight:v51` | FAIL/BLOCKED | Missing genuine lockfile and supply-chain review |
| `npm run build --workspace apps/api` | FAIL/BLOCKED | Missing NestJS/Node/Argon2 dependencies/typings |
| Real PostgreSQL `test:pg:disputes:v77` | NOT RUN | Requires trusted Kali, installed dependencies, isolated test DB and restricted runtime user |
| HTTP, browser, ClamAV, independent security | NOT RUN | Required before production |

Test runner file: `tools/e2e-pg-cross-case-disputes-v77.mjs` (read-only `--plan` works; guarded `--run` fails closed without confirmation). No simulated PASS is reported as a real PostgreSQL pass.

Note: The first full offline matrix detected a v0.75 fixture that only accepted versions 0.75 or 0.76; it was fixed to accept the new 0.77 and rerun PASS. An additional CI contract test flagged an accidentally `test:pg:*`-prefixed plan-only script, corrected by renaming it to `disputes:pg:plan:v77`. Regressions passed after both changes.
