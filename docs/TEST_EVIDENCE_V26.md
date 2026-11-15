# AssetTrust v0.26 — Test and release evidence

**Compiled by Aturinzire Hargreave.** Test execution performed in the supplied checkpoint environment, not against a live production-like deployment.

## RED → GREEN

- Before the patch, `node --test tools/tests-v26/*.test.cjs` exited 1 with **5 failed / 5 passed** new tests. Failures reproduced the FINAL_REVIEW advancement deadlock and inaccessible final reviewer policy. See separate `v26-RED.log`.
- After the domain policy patch and test correction for the existing ownership disclaimer, `npm run verify:v26` passed **16/16 tests** and an isolated strict `tsc` check of the modified framework-free domain/application modules.
- An existing v0.3 regression expected the former, unreachable final-stage legal reviewer role. It initially failed and was explicitly updated to test the corrected, more secure final policy. No historical test was skipped.

## Full offline regression

Commands passed: **27/27**. Each command log and the machine-readable result summary are bundled in the evidence ZIP.

- PASS — `npm run smoke:offline`
- PASS — `npm run verify:v03`
- PASS — `npm run verify:v04`
- PASS — `npm run verify:architecture`
- PASS — `npm run verify:v05`
- PASS — `npm run verify:syntax`
- PASS — `npm run verify:v06`
- PASS — `npm run verify:v07`
- PASS — `npm run verify:v08`
- PASS — `npm run verify:v09`
- PASS — `npm run verify:v10`
- PASS — `npm run verify:v11`
- PASS — `npm run verify:v12`
- PASS — `npm run verify:v13`
- PASS — `npm run verify:v14`
- PASS — `npm run verify:v15`
- PASS — `npm run verify:v16`
- PASS — `npm run verify:v17`
- PASS — `npm run verify:v18`
- PASS — `npm run verify:v19`
- PASS — `npm run verify:v20`
- PASS — `npm run verify:v21`
- PASS — `npm run verify:v22`
- PASS — `npm run verify:v23`
- PASS — `npm run verify:v24`
- PASS — `npm run verify:v25`
- PASS — `npm run verify:v26`

## Separate release gate results (unresolved)

- `npm ci --offline`: failed (`EUSAGE`, absent npm-generated lockfile).
- `npm run release:gate:v17`: failed as intended, absent reviewed `package-lock.json`.
- `npm run build`: failed on missing `@types/node`, NestJS and other runtime type dependencies. The React build was not reached.
- An attempted `npm install --package-lock-only` did not finish within the workspace timeout; no authentic lockfile was generated.
- No Docker, PostgreSQL binaries, live DB server, HTTP API or browser end-to-end validation is available in this runtime; these checks are **NOT EXECUTED**, not passed.
- Syntax scan validated 58 TS/TSX files via transpilation, **not a complete typechecked build**.

## Additional known functional gap

The user-facing team invitation endpoint's `INVITE_ROLES` excludes `ORG_ADMIN`; secure second-administrator enrollment remains necessary to exercise the two-person final approval flow without manual provisioning. Treat as a release blocker for the final-review workflow.

**Release decision: BLOCKED.** Do not promote to production or claim official land-title verification.
