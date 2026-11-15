# AssetTrust v0.51 - Connected Kali Linux validation

**Release: NO-GO. Do not run migration or test scripts against real user or production data.**

## A. Preserve the original repository and its complete history

Use the canonical Git repository with its `.git` history. The ZIP archive is a source handover, not a Git clone; its full-history secret check intentionally fails without Git history. Back up any current database and encryption/signing keys before upgrading. Do not overwrite a live `.env` or run migration 021-025 with old API servers still serving protected queries. For this exercise, use a fresh local, disposable database named `assettrust_ci` or `assettrust_test`.

On a *clean working tree*, start a new branch and copy the extracted `assettrust-v51` source into your canonical Git clone, retaining `.git` and any locally managed secrets. Review `git diff --stat`, `git diff --check`, CI, migration manifests, and all new scripts before executing them; do **not** blindly replace files in a dirty repository.

## B. Generate an authentic reviewed npm lockfile

Requires trusted network access and Node.js >= 22.12, with npm 10/11 available:

```bash
node --version
npm --version
npm config get registry
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm run supply-chain:v51
npm run release:preflight:v51
```

The install command generates a *real* npm lockfile from registry metadata, not a fabricated dependency graph. Review resolved domains, package versions, `hasInstallScript` packages and integrity fields before committing `package-lock.json`. Any supply-chain checker error is a blocker; do not bypass it by editing the checker to permit untrusted package URLs. Commit the reviewed lockfile to the canonical Git repository.

A clean `npm ci` must then work. Do **not** run `npm audit fix --force` blindly or approve an unreviewed lockfile.

## C. Run full build and source/history validation

```bash
npm run release:plan:v51             # safe read-only plan
npm run release:validate:v51         # npm ci, audit, 49 versions, tests, builds, Git-history scan
```

This command requires the genuine lockfile. The final Git-history scan requires a complete non-shallow clone and should be supplemented by gitleaks or an equivalent independent scanner. Review the resulting `test-evidence/v51/local-validation-summary.json`; it records command exit outcomes without storing credentials. Even a complete PASS is *not* production approval.

## D. Authorize DB validation against a new disposable local PostgreSQL only

Provision PostGIS and a **freshly created** local `assettrust_ci` database. Never point this runner at your live `assettrust_dev` or production database. The test suite creates roles and test data, so treat the entire database as disposable. Prefer an isolated test database and a dedicated test superuser/migration role; keep the eventual production runtime role separate and non-owner/non-BYPASSRLS.

Use a password manager or protected local shell for PostgreSQL credentials. Do not commit them or paste them into public screenshots. Then, within that same shell:

```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V51_ALLOW_DATABASE_TESTS=YES
export ASSETTRUST_V51_DB_CONFIRM=assettrust_ci
export ASSETTRUST_V51_LOCAL_CONFIRM=YES
export DATABASE_URL='postgresql://assettrust_ci_user@127.0.0.1:5432/assettrust_ci'
# Configure the CI DB password securely, e.g. via a protected ~/.pgpass or PGPASSWORD.
npm run release:database:v51
```

The runner refuses remote database hosts, a database without the `_ci`/`_test` suffix, mismatched DB confirmation, `NODE_ENV=production`, and missing explicit mutation authorization. It migrates **only the authorized disposable database**, checks migration immutability, then runs all declared PostgreSQL contracts from the root package. If any contract fails, the summary records `FAILED` and stops. Do not interpret this as a pass without actually seeing every test exit 0.

For combined build + DB validation, once the exact same safety configuration is in place, use `npm run release:full:v51` instead. It does not automatically conduct all two-running-server browser tests, TLS/SSH assessments, independent penetration testing or key rotation.

## E. Required release signoff after successful validation

1. Produce genuine SBOM/dependency audit, resolve high/critical vulnerabilities, prove clean builds and a complete secret history review, rotate confirmed exposed keys.
2. Prove tenant A/B denial on every protected table and authorized flows with at least two API instances, restricted PostgreSQL runtime credentials and transaction pool reuse.
3. Test registration/login, MFA, reset via trusted relay, report/recipient download, cancellation, admin two-person approvals, secure browser cookies and CSRF.
4. Verify HTTPS/HSTS, database not publicly reachable, SSH behind approved VPN/bastion or firewall, backups/restores, upload malware checks and monitoring.
5. Obtain independent security review and legal/privacy checks for land/asset verification claims. Never claim official land-registry certification.

**Final status remains NO-GO until real evidence is reviewed and signed off.**
