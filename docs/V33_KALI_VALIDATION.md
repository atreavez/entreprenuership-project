# AssetTrust v0.33 — Kali Linux installation and validation

**Prerequisites:** Node.js 22.12+, npm, Docker/Compose or PostgreSQL/PostGIS 17, internet access for initial `npm install`, test-only credentials, and an independent backed-up working copy. No full build or PostgreSQL integration has been validated in the packaging environment.

## 1. Unpack and review

```bash
cd ~/Downloads
unzip AssetTrust_v33_Notification_Provider_Admin_Checkpoint.zip
cd assettrust-v33
node --version && npm --version
```

Inspect `.env.example` and never copy production secrets into screenshots, issue reports or chat. Use independent strong JWT, MFA and document-encryption keys. Do not rotate existing encryption keys during an upgrade without a verified key migration plan.

## 2. Generate and review an authentic npm lockfile

```bash
npm install --package-lock-only
# Inspect the lockfile and npm audit findings before committing.
npm ci
npm run release:gate:v17
npm run build
```

`npm install --package-lock-only` and `npm ci` need a working registry connection. A handcrafted or placeholder lockfile must not be used to bypass the release gate. Stop at any failed command and investigate the actual error.

## 3. Execute offline tests

```bash
npm run verify:v33
npm run verify:architecture
npm run verify:syntax
npm run verify:v32
npm run verify:v11
```

`verify:v33` runs strict domain-policy tests plus controlled test substitutes for the actual service methods. It does not require a database.

## 4. Create a disposable database, not your real records

Configure a **new**, intentionally disposable local PostgreSQL database with PostGIS, isolated credentials and a distinct development configuration. Verify `.env` and service URLs before any migration or test. A fresh installation can use:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:check
```

**Upgrade warning:** Existing installations may require the explicit v0.11 ledger-baseline process. Preserve a database snapshot and inspect the migration history before applying a new migration. Do not use fresh-install commands blindly.

The rollback-only provider SQL contract test refuses to run without explicit disposable-database approval:

```bash
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:pg:providers:v33
```

Do not run this command unless your `DATABASE_URL` points to the intended loopback-only disposable database and the policy allows the name. If the `pg` module or server is missing, fix the build/environment first.

## 5. Start API and frontend when build/schema checks pass

```bash
npm run dev:api
# in another terminal
npm run dev:web
```

Visit `http://localhost:5173` and open **Notification Providers** as an authorized organization administrator with MFA enabled. Stage a route, confirm it stays pending, then authenticate as a *different current organization administrator* and approve/reject. The visible delivery state must remain **Not connected**.

Do not enter SMTP passwords or API tokens into the `credentialRef` input. A value such as `vault://assettrust/email-primary` is a lookup alias only; v0.33 does not resolve it or send a message. No external email/SMS test can succeed until the separate transport adapter is implemented.

## 6. Production release checklist

- Reviewed `package-lock.json`, successful `npm ci`, full API+React build and test pipeline
- Correct schema migration fingerprints and repeatable migrations
- Real PostgreSQL authorization, tenant isolation, concurrency and rollback tests
- Full browser tests, MFA tests, verified organization-admin separation
- Separate secret manager, vetted provider adapters, genuine delivery receipts, consent/suppression, auditing and deployment metrics
- Staging security assessment, backup/restore drill, legal/privacy review for Uganda deployment

Until all required gates pass, **do not deploy AssetTrust as production-ready**.
