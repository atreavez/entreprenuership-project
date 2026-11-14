# AssetTrust v0.56 — Verified Vite Entry & Browser Artifact Security Gate

Date: 11 November 2026. Development checkpoint; **production release NO-GO**.

## Confirmed defect fixed

The `apps/web/` project did not contain `index.html`, Vite's required HTML entry. Added a minimal reviewed HTML5 entry containing `#root` and a local module script that loads `/src/main.tsx`. This removes a definite Vite entrypoint defect. A successful compiled Vite build cannot be claimed without installed dependencies.

## Implemented release checks

- `tools/build-artifact-gate-v56.cjs`: dependency-free `--source` and post-build `--build` checks. The source mode checks HTML entry, local imports, browser-only public environment access, and workspace versions.
- The post-build mode verifies both API and web outputs, Vite-generated scripts referenced by `dist/index.html`, safe deployment files, no broken asset references, and heuristic server-secret markers in generated JS/CSS/HTML/JSON. It rejects obvious source maps, private key files, `.env` and symlinked build output. **These checks cannot prove absence of all secrets.**
- `tools/tests-v56/build-artifacts-v56.test.cjs`: 20 tests covering valid and adversarial fixtures.
- `.github/workflows/ci.yml`: source checks before `npm ci`, v0.56 regression suite, and compiled-artifact checks after `npm run build`.
- `tools/release-validation-v51.cjs`: supervised Kali full-build plan now requires the post-build gate immediately after compilation.
- Root and workspace package versions updated to `0.56.0`. One older test's hardcoded version expectation was made future-compatible.
- No database schema migrations changed or added.

## Verification & limitations

**PASS:** 20/20 new tests; 54/54 historical and current version suites (v0.03–v0.56) passed in recorded runs; CI workflow policy, source graph, architecture and syntax scans; 25 migration hashes unchanged.

**BLOCKED:** No genuine `package-lock.json` or installed npm packages. Full TypeScript build failed because Node and NestJS type packages are unavailable. The required post-build gate correctly rejected absent compiled output. The latest actual PostgreSQL, browser, ClamAV, Git-history and production-infrastructure tests have not been run here.

**Release verdict: NO-GO.** This is a security-hardened source checkpoint, not a proof of production safety.
