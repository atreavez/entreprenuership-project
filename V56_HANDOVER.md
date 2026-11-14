# AssetTrust v0.56 — Engineering handover

## Source modifications

| File | Change |
|---|---|
| `apps/web/index.html` | Adds missing Vite HTML bootstrap, React `#root`, module entry and accessible metadata. |
| `tools/build-artifact-gate-v56.cjs` | New dependency-free source and compiled artifact policy. |
| `tools/tests-v56/build-artifacts-v56.test.cjs` | 20 tests with malformed source/build fixtures and fail-closed assertions. |
| `.github/workflows/ci.yml` | Verifies source before `npm ci` and built artifacts after compilation. |
| `tools/release-validation-v51.cjs` | Adds `post-build-artifact-gate` after `api-and-web-build`. |
| `package.json`, API/web package manifests | Versions to 0.56.0, new scripts. |
| `tools/tests-v55/lockfile-bootstrap-v55.test.cjs` | Removes stale exact current-version assertion. |

## Commands

```bash
npm run verify:v56
npm run build:source:v56
npm run verify:ci:v41
npm run verify:ci:v53
npm run verify:architecture
npm run verify:syntax
```

After generating and reviewing a genuine lockfile, then running `npm ci` and `npm run build`, execute:

```bash
npm run build:artifacts:v56
```

This latter command **must fail** if the build was not produced, generated frontend resources are missing, or obvious sensitive artifacts are shipped. It is a policy check, not a penetration test or a guarantee that the frontend contains no credentials.

## Upgrade and operational cautions

No SQL migration was added. Do not overwrite production `.env`, keys or database contents. Keep the original Git clone for history scanning. Follow `V56_KALI_VALIDATION.md` to prove the missing npm/build steps with live evidence. Only use disposable PostgreSQL test databases for mutating integration tests. The mandatory all-project release security standard remains in force.

**Decision: NO-GO.**
