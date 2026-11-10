# AssetTrust v0.2 — developer installation, verification and operations runbook

## Requirements

Node.js 22.12+ (Node 24 LTS also suitable if dependencies support it), npm, PostgreSQL 17, Docker Compose optional, an empty development database and a development-only `.env`. Initial npm package download needs an internet connection. Do not use production identity or title data during evaluation.

## Start a new development copy

```bash
unzip AssetTrust_Expanded_v02.zip
cd assettrust-expanded
cp .env.example .env
# Generate and set your own secret:
openssl rand -hex 32
# Edit DATABASE_URL, JWT_SECRET and UPLOAD_DIR in .env
docker compose up -d postgres
npm install
npm run db:migrate --workspace apps/api
npm run test
npm run build
npm run dev:api
# New terminal:
npm run dev:web
```

Visit `http://localhost:5173`. API health: `http://localhost:4000/api/v1/healthz`. The health response does not prove database readiness: verify an authenticated database-backed request too.

**Existing starter users:** do not overwrite the existing database. Apply `002_operations.sql` with the documented migrator after checking a backup in a non-production environment. The migration adds tables, does not rewrite base records, but still needs testing with your data.

## Design-only preview

```bash
cd apps/web
VITE_DESIGN_PREVIEW=true npm run dev
```

This mode displays fictional information, disables save actions and does **not** call a real government registry. Screenshot captures use an offline renderer and do not prove the actual Vite app works.

## Smoke-test checklist (actual API + database)

1. Register an organization (12+ character password), log in and fetch `/auth/me`.
2. Register a land asset, list it and confirm a different organization cannot obtain the asset UUID.
3. Create a verification case and add `IDENTITY` evidence for the `INTAKE` stage.
4. Attempt to advance with no evidence and verify a 409 response. Then advance after source evidence exists.
5. Invite a reviewer; accept the one-time token, then confirm reusing the token fails.
6. Assign a case to that member; verify the member can see assigned records but cannot access another member's unrelated record.
7. Create a task and confirm the assignee receives an in-app notification.
8. Upload an allowed PDF under an asset/case; verify download and digest. Upload a disguised file and verify rejection.
9. Report a dispute; verify the case is blocked from advancement. Resolve as admin and check audit events.
10. Create a future-dated reminder and a draft UGX quote. Confirm these do not trigger a real payment or external notification.
11. Fetch integration status and assert registry, blockchain and payments say `NOT_CONNECTED`.
12. Fetch `/integrations/local-proof`; assert it says `LOCAL_AUDIT_COMMITMENT_NOT_BLOCKCHAIN`.
13. Run `/audit/verify` as admin, mutate one event in disposable test DB and check verification fails.
14. Check 390px and 1440px app layouts, keyboard navigation, mobile menu and horizontal overflow.
15. Test with 1,000+ cases, simultaneous case advance/evidence requests, an expired grant, stale sessions and revoked users.

## Engineering release discipline

Use four isolated configurations: development, QA, UAT/pilot, and production. Never share secrets across them. Establish CI checks for unit tests, API integration tests, migrations on an empty and upgraded DB, web build, end-to-end flows, dependency vulnerability checks and container scans. Keep a signed release manifest and roll back using tested migrations and backups, not ad-hoc SQL changes.

## Production deployment blockers

This ZIP is **not** ready for internet-facing production. Before deployment: use HTTPS; move bearer tokens to a secure session model; MFA for privileged users; private object storage and malware scanning; backups with restore tests; database role separation; audit log export; operational monitoring; legal/privacy sign-off; professional vetting; and external integration contracts.

## Suggested project commands

```bash
npm run dev:api
npm run dev:web
npm run test
npm run build
node tools/offline-domain-smoke.cjs  # dependency-free pure helper check only
```

For staging/prod use a real secret vault or environment injection, private database networking, automated TLS, per-service credentials, service-level logging and a secure deployment pipeline. The sample Docker Compose exposes only development PostgreSQL on loopback.
