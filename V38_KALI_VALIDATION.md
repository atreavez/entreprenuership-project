# AssetTrust v0.38 — Kali Linux installation and validation

**Development checkpoint only.** If the local project is currently v0.22 or older, do not apply the v0.38 schema blindly. Preserve your earlier source, database and encryption keys. The entire historical migration chain must be reconciled before upgrading.

## 1. Extract and inspect

```bash
cd ~/Downloads
unzip -t AssetTrust_v38_Governed_PDF_Layout_Checkpoint.zip
unzip AssetTrust_v38_Governed_PDF_Layout_Checkpoint.zip
cd assettrust-v38
node --version  # >=22.12 recommended
npm --version
```

Never import unknown secrets or dependencies from this source package.

## 2. Install trusted dependencies and run offline checks

The source archive does **not** contain an authentic npm-generated lockfile. When a supported npm registry is reachable, review the dependencies, then generate and commit a real lockfile before `npm ci`:

```bash
npm install --package-lock-only
npm ci
npm run verify:v38
npm run verify:v37
npm run verify:v35
npm run verify:v11
npm run verify:architecture
npm run verify:syntax
npm run build
```

Do not use `--force`, synthetic lockfiles or fake passing output. Resolve all build errors before deploying.

## 3. Database migration (disposable environment first)

1. Prepare a local PostgreSQL database with PostGIS extension in a disposable test environment. For existing databases, back up and *test restore* and retain original encryption/signing keys. Run `npm run db:check` to inspect applied migration state.
2. Verify historical ledger checksums for migrations `001`–`015`. Do not modify those source migrations or use `db:baseline` to avoid the new migration.
3. In an approved, disposable environment, configure `.env` using strong, distinct local secrets and a nonproduction `DATABASE_URL`. Execute:

```bash
npm run db:migrate
npm run db:check
```

The new migration `016_report_pdf_layouts.sql` creates three tables and database guards. Confirm the readiness probe requires migration 016 and the new tables. Do **not** run write-capable tests against production or a personal-data database.

## 4. Administrator browser acceptance test

Run `npm run dev:api` and `npm run dev:web` in separate terminals. Use real accounts, **not** demo mode. Prepare two distinct MFA-enrolled organization admins, A and B, and one isolated organization C. Tests:

- A opens **Report Issuance → PDF report design control**, changes the organization-branded header/footer/color and submits a reason. Confirm the active revision is unchanged pending decision.
- A cannot approve its own proposal. B must have fresh MFA and current active admin status to approve; B approves and revision advances from 0 to 1.
- Revoked/suspended B and organization C cannot read or approve another tenant's layout. Old proposals cannot be approved twice and revision history cannot be overwritten.
- Export a fictional issued report from the authorized organization. The downloaded PDF shows the approved header/footer/revision and the **fixed** non-official warning. The detached Ed25519 receipt verifies with a separately pinned public key:

```bash
node tools/verify-report-pdf-v37.cjs \
  /path/to/report.pdf /path/to/report.receipt.json /path/to/pinned-keys.json
```

- Change a byte in the PDF and confirm signature verification fails. Review the export audit event for its PDF digest and `layoutRevision`.
- Reject another proposal and confirm the revision does not advance. Verify all unknown fields, malicious markup, unsupported colors and misleading government-credential language are rejected.

## 5. Release gate

The container-based offline tests are not an npm build, a real PostGIS migration, an authenticated browser test, or a production security review. Keep v0.38 on a staging branch until those gates pass. The PDF is a **private non-official evidence report** authenticated by a detached Ed25519 receipt, not native PAdES or an official ownership certificate.
