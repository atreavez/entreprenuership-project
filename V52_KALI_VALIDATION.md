# AssetTrust v0.52 — Kali Linux validation and deployment operator guide

**Release status: NO-GO until each required live step is evidenced and signed off.** This procedure does not approve production use.

## 1. Backup and source preparation

Start from the latest checked-out source; work on a new branch. Stop older API processes before a coordinated scanner-enforcing deployment. Protect all real user records and encryption/signing keys. On a disposable restored PostgreSQL copy, prove that backup restoration works before changing any production system.

```bash
cd ~/Projects/assettrust-github-v22/assettrust-v22
# Or extract the new ZIP to a NEW folder; do not overwrite a working deployment blindly.
node --version
npm --version
sha256sum -c AssetTrust_v52_SHA256SUMS.txt  # if checksum and archive are in the same directory
```

**Do not run the provided disposable PostgreSQL tests against a real customer database.** The source checkpoint has no genuine `package-lock.json`: generate a genuine dependency graph using a connected, reviewed npm registry (not by copying a synthetic fixture), examine all transitive versions and install scripts, commit the lockfile, then run:

```bash
npm install --package-lock-only --ignore-scripts
npm run supply-chain:v51
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm test
npm run verify:v52
npm run verify:ci:v41
npm run security:scan:v43 -- --history
```

Review dependency vulnerabilities, remediation, source/provenance and the complete Git history before considering release. The history scan requires the original `.git` data and a full-fetched clone. Rotate any secrets proven exposed; removing them from code alone is insufficient.

## 2. Install and isolate the antivirus daemon

On Kali/Debian, arrange for ClamAV signature database updates and the daemon, for example:

```bash
sudo apt update
sudo apt install clamav clamav-daemon
sudo systemctl enable --now clamav-freshclam
sudo systemctl enable --now clamav-daemon
sudo systemctl status clamav-daemon --no-pager
ls -l /run/clamav/clamd.ctl
```

Check the actual socket location from `clamd.conf` rather than assuming the example. Grant only the server application's service account appropriate access to this Unix socket; never make the socket publicly writable, expose the daemon port to the internet or put scanner credentials/configuration in browser JavaScript. Set the **API server's** environment:

```bash
export NODE_ENV=production
export CLAMAV_SOCKET_PATH=/run/clamav/clamd.ctl
unset CLAMAV_TCP_PORT
```

Do not export other production credentials from shell history; use your server-side secret manager. The command below is a dedicated live scanner self-test (EICAR is a harmless industry-standard antivirus validation string):

```bash
npm run security:clamav:v52
```

**Pass criteria:** the benign sample is accepted, the EICAR sample is rejected with a threat verdict, and the process exits successfully. Missing scanner, stale signatures, daemon error, permissions or unsupported protocol **must cause the release to stop**. Test a scanner outage by stopping it in a *staging* environment and confirming the upload endpoint returns a generic HTTP 503 with no file persisted.

## 3. Upload security acceptance on staging

With two independently authenticated organization accounts and an administrator, upload clean PDF/PNG/JPEG/WebP fixtures, invalid extensions, spoofed MIME/magic bytes, 0-byte/oversized payloads, and EICAR test bytes. Confirm: clean files are scanned then encrypted; threats and scanner failures produce no blob, row or success audit; denied-tenant access is blocked before scanning; revocation during uploads still prevents metadata commit; no plaintext is logged; no scanner signature is returned to clients. Verify multi-instance API flows where each server accesses the same trusted scanner service. Verify proxy request-body caps, edge throttling and storage quota controls.

## 4. Database and full release gate

Run `npm run release:plan:v51` read-only first. Use a restored disposable loopback PostgreSQL DB named `assettrust_test` or `assettrust_ci` with explicit test approvals to run the guarded database contracts documented in v0.51. Backup, restore, RLS tenant A/B denial and administrator/recipient workflow testing are still required. Review HTTPS/HSTS, firewall and SSH exposure, database least privilege, cookie/CSRF/MFA, password reset and price validation. Do not accept a release while any high/critical vulnerability, scanner outage, build failure, test failure or tenant-crossing issue remains open.

## 5. Interpreting the downloaded checkpoint

`verify:v52` tests the scanner protocol with a **fake local Unix-socket daemon**. This proves the application's handling of clean/threat/error/timeout responses and the ordering before storage, **not** real malware detection. `security:clamav:v52` checks a **real daemon** and is expected to fail until configured. No ClamAV signature database was bundled with this checkpoint. No versioned SQL migration was introduced.
