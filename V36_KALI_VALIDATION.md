# AssetTrust v0.36 — Kali Linux Installation, Key Setup and Validation

**Read first:** This is a separate *development checkpoint*. Do not overwrite your running AssetTrust checkout or import a real client's database without verified backup, encryption-key continuity and a migration review. The v0.36 signed JSON bundle is **not a digitally signed PDF or official land title**.

## 1. Unpack and install genuine dependencies

```bash
cd ~/Downloads
unzip AssetTrust_v36_Signed_Evidence_Bundle_Checkpoint.zip
cd assettrust-v36
node --version  # must satisfy Node >=22.12
npm install --package-lock-only
# Review and preserve the real package-lock.json (do not fabricate an empty lockfile)
npm ci
npm run verify:v34
npm run verify:v35
npm run verify:v36
npm run verify:architecture
npm run verify:syntax
npm run smoke:offline
npm test
npm run build
```

**Note:** The artifact was developed in an environment without npm registry DNS, so `npm ci`, full project compilation and installed-package integration have **not** been claimed as successful. The commands above must be run on a connected machine/CI. Resolve genuine dependency or typecheck failures instead of bypassing them.

## 2. Configure signing keys locally (do not use real data yet)

```bash
# From assettrust-v36, outside the repository and outside any shared folder:
node tools/generate-report-key-v36.cjs \
  --out "$HOME/.config/assettrust-report-secrets" \
  --key-id dev-report-2026
chmod 700 "$HOME/.config/assettrust-report-secrets"
```

The key tool prints **paths and the public key fingerprint only**. It creates two files: a private PKCS#8 DER key encoded in base64 (mode `0600`) and a public JSON keyring for independent offline validation. Store the private file in a dedicated secret store in production, never in Git, website content, ZIP packages, browser JavaScript, screenshots, or a log.

In your local `.env` (not tracked in Git), set the following **with your actual generated values**:

```dotenv
ASSETTRUST_REPORT_SIGNING_KEY_ID=dev-report-2026
ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64=<paste only the single base64 line from the private file>
```

These are *additional* to your required JWT, MFA, document-encryption, database and web-origin settings. **Never paste a production private key into this chat.** If you later rotate keys, keep archived public keys in a separately trusted registry so old exports can still be verified.

## 3. Keep PostgreSQL safe

The new v0.36 feature makes **no schema changes**. The migration ledger remains 15 SQL files through `015_report_withdrawal.sql`.

```bash
npm run db:check
# On a new, disposable PostgreSQL/PostGIS database only:
npm run db:migrate
npm run db:check
```

For a v0.22 database, carefully run all pending migrations in order, preserve encryption keys, and do not use `db:baseline` as a workaround. For a v0.35 database, v0.36 adds no new migration.

## 4. Run the platform and export a sample report

```bash
npm run dev:api
# In another terminal, in assettrust-v36:
npm run dev:web
```

Use two distinct current organization admins with enrolled MFA. Issue a fictional test report following the existing independent approval workflow; select it under **Report Issuance**; choose **Download signed evidence bundle (.json)**. The server refuses invalid digest, invalid signing key, missing MFA or cross-organization access. Its audit should record the export without private evidence content. A withdrawn report's bundle must display WITHDRAWN *at export*, and its online QR must still show the current status.

## 5. Independently verify the downloaded JSON

Copy the administrator-downloaded JSON file and the **independently trusted** public JSON keyring to a safe offline machine. Confirm the public key fingerprint out-of-band with the organization's trusted operator; do not trust a key simply because it appeared next to the bundle.

```bash
node tools/verify-report-bundle-v36.cjs \
  "$HOME/Downloads/assettrust-signed-evidence-REPORT_UUID.json" \
  "$HOME/.config/assettrust-report-secrets/trusted-report-public-keys-dev-report-2026.json"
```

Replace `REPORT_UUID` with the actual downloaded filename. Expected result: `SIGNATURE VALID` and a warning to check the live status. Change even one character in the snapshot (preserving JSON syntax); verification must fail. Replace the trusted key with an unrelated key; verification must fail. Do not disclose the downloaded private evidence publicly.

## 6. Remaining release gates

Before a real client pilot, run database contract tests on a disposable DB using `ASSETTRUST_E2E_ALLOW_MUTATION=YES`, prove two-administrator workflows in an actual browser, verify security headers/caching, finalize data retention/recipient authorization, build a pinned independent key-distribution and revocation process, and obtain professional/legal review of how private reports are described in Uganda. Implement signed **PDF** generation separately if required; the JSON signature does not make a PDF signed.
