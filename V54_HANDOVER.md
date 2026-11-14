# AssetTrust v0.54 - Handover

## Summary

Checkpoint focus: historical source-secret detection and a practical Kali verification path. Version updated to 0.54.0, no database migration added. The historical scanner now uses bounded Git batch protocol calls, inspects locally retained reflog-only commits and historical commit messages, and supports scanning the actual original repository with `--repo`.

## Changed code paths

- `tools/git-history-batch-v54.cjs` - bounded read-only Git metadata and content batching
- `tools/secret-scan-v43.cjs` - uses new engine for `--history`; adds `--repo PATH`
- `tools/tests-v54/history-v54.test.cjs` - 15 real-Git security and CI tests
- `package.json`, `apps/api/package.json`, `apps/web/package.json` - synchronized 0.54.0 and new scripts
- `.github/workflows/ci.yml` - runs v0.54 regression and history scan
- `tools/workflow-policy-v53.rb` - disallows omission of the new history scan
- `tools/tests-v53/workflow-v53.test.cjs` - compatible with future additive version suites

No API route, SQL migration, existing customer data, live key, running service or external account was modified.

## Verification and deployment status

- 15/15 new tests PASS; 52/52 version checks PASS; architecture, syntax, YAML policy and offline smoke PASS.
- 25 existing migration fingerprints match previous version; 89-stage release plan is prepared, not executed.
- Real Git history scan remains NOT RUN in this packaged environment. Snapshot source scanning passed but does not establish that Git history is clean.
- `npm ci`, builds, tests needing dependencies, live ClamAV, PostgreSQL, two-API and browser tests remain BLOCKED or NOT RUN.
- **Production release decision: NO-GO**.

## Next action

Follow `V54_KALI_VALIDATION.md` on the owned Kali clone, review actual history findings, produce the authentic lockfile, establish disposable PostgreSQL/ClamAV and run supervised validation. Do not upload credentials or sensitive logs into public issues or chat.
