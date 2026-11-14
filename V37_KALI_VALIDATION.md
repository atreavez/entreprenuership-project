# AssetTrust v0.37 - Kali Linux local installation and verification

## Safety first

This package is a complete **development source checkpoint**, not an update script to apply blindly to an existing live installation. Preserve your existing v0.36 directory, local customizations, secrets and database. Never run migrations against production without a verified restore point. The v0.37 feature itself introduces **no new SQL migration**; it expects the v0.35/v0.36 baseline with 15 existing migrations.

## 1. Extract a separate working copy

```bash
cd ~/Downloads
unzip -t AssetTrust_v37_PDF_Report_Detached_Signature_Checkpoint.zip
unzip AssetTrust_v37_PDF_Report_Detached_Signature_Checkpoint.zip
cd assettrust-v37
node --version          # use a supported Node.js (>=22.12)
npm --version
```

**Do not copy `.env` or `node_modules` from an untrusted source.** Review `package.json` and the source changes first. The checkpoint does not invent a dependency lockfile.

## 2. Generate and review real dependencies

On your online Kali machine:

```bash
npm install --package-lock-only
npm ci
npm run verify:v37
npm run verify:v36
npm run verify:v35
npm run verify:v34
npm run verify:architecture
npm run verify:syntax
npm run build
```

An npm failure needs investigation; never use `--force` or a fabricated lockfile merely to bypass the release gate. The offline verification commands are not a substitute for the full build.

## 3. Connect to a DISPOSABLE local database

```bash
cp .env.example .env
# Configure a disposable DATABASE_URL, JWT_SECRET, MFA_ENCRYPTION_KEY,
# DOCUMENT_ENCRYPTION_KEYS and WEB_ORIGIN. Generate separate random secrets.
# Obtain the necessary existing PostGIS-enabled PostgreSQL instance first.
npm run db:check
# On a brand-new disposable DB only, after examining the migration plan:
npm run db:migrate
npm run db:check
```

On an existing v0.36 database first back up and independently test restore and migration checksums. Do not use `db:baseline` to skip required migrations. Do not run destructive E2E tests on any real customer database.

## 4. Protect the Ed25519 signing key

```bash
# Use the existing v0.36 generator only in a private directory:
mkdir -p "$HOME/.assettrust/keys"
chmod 700 "$HOME/.assettrust/keys"
node tools/generate-report-key-v36.cjs --out "$HOME/.assettrust/keys" --key-id dev-v37-2026
```

Place only the private PKCS#8 DER **base64** in server secret configuration via `ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64`; set `ASSETTRUST_REPORT_SIGNING_KEY_ID` to the matching key ID. Never commit either value, print a private key to support logs, or reuse production keys in test environments. Distribute the generated public key and fingerprint independently to intended verifiers. Keep historic trusted keys for old receipts; have an incident response and revocation process.

## 5. Start and exercise the UI

```bash
npm run dev:api
# In another terminal:
npm run dev:web
```

- Authenticate as a real current organization admin with fresh MFA, not demo mode.
- Create and independently approve an evidence case/report, using two different current admins, if a disposable test dataset is available.
- In **Report Issuance**, select an issued report and click **Download report PDF + verification receipt**.
- Keep both `assettrust-report-<reportId>.pdf` and `assettrust-report-<reportId>.receipt.json`. Some browsers require permission for multiple automatic downloads.
- Confirm the PDF has the correct status at export, sensitive evidence details remain confidential, no public private-contents route exists, and the audit event is recorded. Test a tenant with no access, failed MFA and tampered source digest.

## 6. Verify a downloaded PDF without Internet access

Export the trusted keyring through an independently verified channel (the example demo key is **fictional and not a production trust anchor**). Then run:

```bash
node tools/verify-report-pdf-v37.cjs \
  ~/Downloads/assettrust-report-REPORT-ID.pdf \
  ~/Downloads/assettrust-report-REPORT-ID.receipt.json \
  ~/secure-keys/assettrust-pinned-public-keys.json
```

An authentic signature and exact PDF SHA-256 will produce `PDF SIGNATURE RECEIPT VALID`. Modify one byte of the PDF, change receipt status, or change the trusted public key; each must fail. A cryptographically valid PDF does **not** mean verified ownership or that its status is current. Always consult the current public QR status and the appropriate official authorities.

## 7. Demo-only sample (if included separately)

```bash
node tools/verify-report-pdf-v37.cjs \
  AssetTrust_v37_DEMO_Report.pdf \
  AssetTrust_v37_DEMO_Report.receipt.json \
  AssetTrust_v37_DEMO_Pinned_Key.json
```

This demo is synthetic, was generated with an ephemeral signing key, and must never be used as evidence of an actual land or asset verification. Full database, browser, signing-key ceremony, production build and legal reviews remain blocked/not yet validated.
