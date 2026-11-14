# AssetTrust v0.54 - Kali Linux security and release validation

**Release status: NO-GO.** These instructions target an owned Kali development machine and test environment. Do not use a production or customer database. Take verified encrypted backups before upgrading. Never commit API keys, signing keys or database passwords.

## A. Extract and run offline tests

```bash
cd ~/Downloads
unzip AssetTrust_v54_Git_History_Security_Checkpoint.zip
cd assettrust-v54
node --version
npm run verify:v54
npm run verify:ci:v53
npm run security:scan:v43
```

The package's full-history scan should fail here because a ZIP does not contain `.git`. This is intentional. Do not change its result to pass or copy a `.git` folder into the ZIP.

## B. Scan the real original Git repository without changing it

On your Kali machine, use the **actual** clone that contains your previous AssetTrust commits:

```bash
cd ~/Downloads/assettrust-v54
npm run security:scan:v54 -- --repo "$HOME/Projects/assettrust-github-v22/assettrust-v22"
```

If your repository is elsewhere, replace that path with its existing canonical clone. This is read-only. The scanner checks branch/tag objects plus locally retained reflog commits; it rejects shallow history, unusual Git errors and large unreviewed objects. It does **not** delete or rewrite history, and it never prints matching token values. An exit status of 1 indicates a finding or incomplete scan, **not** permission to ignore it.

To ensure all relevant remote refs are available, review your Git remotes and fetch the approved branches/tags through your normal Git workflow. Fetching modifies local refs; do it intentionally and **do not** use `git reset --hard`, `git clean -fd`, or a history rewrite as a first response. Check any Git submodules and forks separately.

Run an independent professional scanner (e.g. Gitleaks or TruffleHog) against the complete repository and hosting-platform secrets where authorized. If a real secret was exposed, revoke/rotate the credential with its provider, invalidate dependent sessions/tokens, review access logs, then plan any necessary Git history rewrite with collaborators. Deleting a commit does not revoke a secret.

## C. Generate an authentic lockfile and validate dependencies

On a trusted network-connected Kali development machine, after reviewing root and workspace manifests:

```bash
npm install --package-lock-only --ignore-scripts
npm run supply-chain:v51
npm ci
npm audit --omit=dev --audit-level=high
npm test
npm run build
```

Do not fabricate `package-lock.json` or suppress audit failures. Commit a reviewed lockfile to the canonical Git repository. Resolve package vulnerabilities with reviewed changes and rerun tests.

## D. Real ClamAV and disposable PostgreSQL

After installing the daemon from trusted Kali OS packages, updating antivirus signatures and checking socket permissions:

```bash
export CLAMAV_SOCKET_PATH=/run/clamav/clamd.ctl
unset CLAMAV_TCP_PORT
npm run security:clamav:v52
```

Confirm the exact socket path from your ClamAV configuration; use the harmless EICAR signature in the test harness. Reject scanner outages and never expose ClamAV to the public internet.

Provision an **empty loopback-only** PostGIS database named `assettrust_ci` or `assettrust_test` with separate test credentials, and set `DATABASE_URL` via a private environment manager. Verify backup/restore before changing existing databases. The migration and API checks deliberately refuse unsafe targets.

For an approved disposable test instance only:

```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V51_ALLOW_DATABASE_TESTS=YES
export ASSETTRUST_V51_DB_CONFIRM=assettrust_ci
export ASSETTRUST_V51_LOCAL_CONFIRM=YES
export ASSETTRUST_E2E_URL=http://127.0.0.1:4000
# Supply DATABASE_URL and required test keys via private environment injection.
npm run release:full:v51
npm run evidence:review:v53
```

This runner now plans **89 ordered stages**. It must complete successfully with the source's real `.git` history, a reviewed package lock, installed dependencies and disposable database authorization; no stage can be reported as passed based on offline simulation. It does not approve production automatically.

## E. Final release controls

Before serving customers: independently verify HTTPS/HSTS, SSH/firewall exposure, least-privileged PostgreSQL roles without RLS bypass, tenant A/B and user isolation, admin MFA, password recovery, CSRF/cookie security, payment prices recomputed on the server, file uploads with real malware scan, comprehensive dependency/SBOM review, storage/DB/key backup restore, legal/privacy requirements, and an independent penetration test. Record evidence and remediate critical/high findings.
