# AssetTrust v0.57 - Engineering handover

Milestone: require a separate, non-superuser/non-BYPASSRLS CI runtime database role for the actual NestJS HTTP integration processes.

New files: `tools/runtime-role-policy-v57.cjs`, `tools/provision-ci-runtime-role-v57.mjs`, `tools/test-ci-runtime-role-v57.mjs`, `tools/tests-v57/runtime-role-v57.test.cjs`.

Modified files: `apps/api/src/database.ts`, `tools/e2e-two-api-v42.mjs`, `tools/ci-live-integration.mjs`, `.github/workflows/ci.yml`, `tools/tests-v53/workflow-v53.test.cjs` (fixture compatibility only), `tools/tests-v56/build-artifacts-v56.test.cjs` (future-version compatibility), root and workspace package manifests, README, changelog.

Behavior: CI fixture orchestration uses a privileged operator login only in a named disposable DB; spawned HTTP APIs use the separately validated runtime login. The runtime startup guard validates all seven RLS tables and rejects owner/superuser/BYPASSRLS roles in production or opted-in CI testing. A new live contract also verifies unscoped records cannot be read. All secrets remain server-side.

Open blockers: genuine lockfile and online npm install; full build; live role provisioning and RLS contract; ClamAV; browser and multi-server tests; authentic Git history; HTTPS, deployment and adversarial testing. No SQL migrations changed. Production release remains NO-GO.

Reviewers should not assume the CI runtime role's broad public-table DML grants constitute production least privilege; restrict permissions further before deploying. Do not rerun migrations against existing production systems without a reviewed backup and staging plan.
