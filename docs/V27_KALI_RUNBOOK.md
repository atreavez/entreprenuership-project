# AssetTrust v0.27 — Kali Linux Build, Upgrade, and Live Verification

## Requirements

Use a supported Node.js 22 release, npm, Docker/Compose, a local disposable PostgreSQL/PostGIS database, and access to the npm registry. Do not treat source-only tests as evidence of an installed full app. Do not commit `.env`, session tokens, MFA secrets, invitation tokens, or private evidence files.

### Unpack and verify

```bash
cd ~/Downloads
unzip AssetTrust_v27_Secure_CoAdmin_Onboarding_Checkpoint.zip
cd assettrust-v27
npm run verify:v27
npm run verify:architecture
npm run verify:syntax
```

### Dependencies, secrets and build

```bash
npm install                      # creates the genuine package-lock.json on a connected machine
npm ci                           # verify reproducible installation
npm run release:gate:v17         # requires reviewed dependency graph
npm run build                    # API and React; fix any real errors observed
```

Make a secure `.env` based on `.env.example`: set `DATABASE_URL`, `WEB_ORIGIN`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, and separate document-encryption keys. Use `openssl rand -hex 32` for independent cryptographic values. Never use example secrets in deployment.

### Database — fresh vs upgrade

For a **fresh disposable development database**, after configuring PostgreSQL/PostGIS:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:check
```

For an **existing v0.26 database with a valid migration ledger**, take and verify a backup first; confirm hashes for existing migrations 001–007; then run `npm run db:migrate` to append only migration **008_coadmin_invitation.sql**. Do not modify applied SQL or recreate the database. Existing databases without a valid migration ledger require separate documented baseline review; do not silently mark migrations applied.

### Start backend and frontend

```bash
npm run dev:api
# In another terminal:
npm run dev:web
```

Open `http://localhost:5173`. A workspace administrator should first configure MFA under **Account Security**, then use **People & Teams → Invite a co-administrator**. Complete an MFA step-up and issue the token privately. The recipient selects *Privileged co-administrator* on the invitation screen, accepts, signs in, and confirms MFA before using any workspace feature.

### Disposable PostgreSQL v0.27 check

The rollback-only script requires `DATABASE_URL` with `localhost` or `127.0.0.1` and a database name containing `test`, `ci`, or `disposable`. Use a **new isolated test database, never an existing real/customer database**.

```bash
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:pg:coadmin:v27
```

The script uses BEGIN/ROLLBACK, checks migration 008, active/stale step-up, revoked session, role downgrade, disabled MFA, and the privileged-invitation constraint. It was written but **was not run in the checkpoint environment**, which lacks PostgreSQL and installed project dependencies.

### Important release gate

The checkpoint workstation cannot install npm dependencies, lacks a genuine `package-lock.json`, and has no running PostgreSQL service. Consequently, the full API and React build, live PostGIS checks, and browser end-to-end flows are **unverified**. They are blocking release requirements, not passed checks.

## Next live tests

1. Finish `npm ci` and `npm run build` with zero errors.
2. Run migrations 001–008 against a disposable PostGIS database and validate schema readiness.
3. Create an organization, enroll the first admin in MFA, perform step-up, and issue a co-admin token.
4. Confirm ordinary `/team/accept` rejects a privileged token; ensure expired, revoked, reused, or downgraded-issuer tokens fail.
5. Verify the new admin is denied all protected workspaces before MFA and is granted access only after confirmation.
6. Run an independent two-admin FINAL_REVIEW evidence submission, review, and closure through the **actual HTTP API and browser**. Do not interpret case closure as an official title determination.
