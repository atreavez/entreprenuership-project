# AssetTrust v0.87 — Connected Kali Acceptance Runbook

**Safety:** Use a trusted Kali workstation, a newly created disposable localhost PostGIS environment and no production/customer credentials or databases. Keep the `.assettrust-local` directory private; do not upload its secrets, live logs or session tokens.

## 1. Inspect the archive before making changes

```bash
cd /path/to/assettrust-v87
node --version
npm --version
npm run verify:v87
npm run verify:architecture
npm run verify:syntax
npm run build:imports:v80
npm run verify:ci:v53
npm run kali:acceptance:plan:v87
npm run kali:acceptance:inspect:v87
```

`compiledProvenanceReady` should be `false` for a fresh archive without real dependencies, compiled outputs and reviewed build evidence. This is **expected and correct**. The planner and inspector are read-only.

## 2. Obtain the genuine dependency lockfile and compile

Use the original reviewed repository `package-lock.json` if one exists. **Do not overwrite it.** For a genuinely fresh ZIP without a lockfile, only from a trusted networked host:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run security:scan:v43
ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
npm run acceptance:provenance:inspect:v86
```

The supervisor must demonstrate the original-source digest and all emitted API and web files matching its seven successful steps. Any compiler error must be corrected in source and **the whole supervised build rerun**; never hand-edit its evidence JSON to turn a failure into success. Build lifecycle scripts are not allowed to receive production secrets.

## 3. Provision disposable PostgreSQL/PostGIS and scanner

Read `V70_HANDOVER.md`, `V70_KALI_VALIDATION.md`, `V77_KALI_VALIDATION.md`, and `V78_KALI_VALIDATION.md`. Verify the local Docker socket, isolated database name `assettrust_test`, host `127.0.0.1`, and the restricted non-superuser non-BYPASSRLS application role. Prepare only a fresh fixture:

```bash
npm run kali:integration:plan:v70
npm run kali:integration:doctor:v70
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:prepare:v70
npm run kali:integration:doctor:v70
```

The prepared fixture includes sensitive private local credentials; do not display or copy them into chat. If there is already a fixture, stop and investigate rather than overwriting or reusing an unknown database.

## 4. Run complete supervised acceptance with continuous integrity checks

```bash
ASSETTRUST_V71_ACCEPTANCE_CONFIRM=YES \
ASSETTRUST_V70_LOCAL_CONFIRM=YES \
npm run kali:acceptance:run:v87
```

The v0.87 run executes the genuine supervised npm install/build, starts isolated PostGIS/ClamAV, applies/verifies migrations, provisions or inspects the restricted runtime login, tests security policies, and runs authenticated HTTP acceptance. **Before and after every child command** it recomputes the current compiled-output and protected-source provenance. If a command or external process changes protected material, later commands are blocked with `BUILD_INTEGRITY_DRIFT`; the private evidence file stays redacted.

To inspect after all tests:

```bash
npm run acceptance:provenance:inspect:v86
npm run kali:acceptance:inspect:v87
```

A successful disposable acceptance is still only **`ACCEPTANCE_COMMANDS_PASSED_RELEASE_BLOCKED`**, not a production approval. Preserve the owner-only private report under `.assettrust-local/v70/evidence`; send only a sanitized summary without credentials. The supervisor does **not** sign evidence or prevent changes that occur entirely within a running child command and are reverted before its post-command check.

## 5. Deliberate negative test — never on customer data

After an authentic build on a second disposable extraction, change one protected compiled file such as `apps/web/dist/assets/*.js`. The read-only `npm run acceptance:provenance:inspect:v86` should fail. A v0.87 acceptance run must fail before starting a subsequent live command. Re-extract/rebuild; do not manually update hashes to hide the mismatch.

## Release gates still required

Complete real multi-tenant RBAC/MFA, concurrent disputes/payments, live document and ClamAV workflows, restricted PostgreSQL RLS tests, browser UI testing, original Git-history and credential rotation, independent vulnerability analysis, TLS/SSH hardening, backup/restore and rollback. **NO-GO** until verified and blockers resolved.
