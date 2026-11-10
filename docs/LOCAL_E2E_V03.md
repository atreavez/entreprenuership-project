# AssetTrust v0.3 — Local development and end-to-end verification

**Compiled for Aturinzire Hargreave.** Target machine: Kali Linux with Node.js, npm, Docker Compose or local PostgreSQL. Use **test accounts and fictional land records only**.

## Install in a clean directory

```bash
unzip AssetTrust_v03_Evidence_Governance_Checkpoint.zip
cd assettrust-v03
cp .env.example .env
openssl rand -hex 32
```

Replace `JWT_SECRET` in `.env` with the generated secret. Replace development DB credentials and confirm `DATABASE_URL` points to the DB you intend to use. Avoid committing `.env` or uploaded documents.

If Docker Compose is installed:

```bash
docker compose up -d postgres
npm install
npm run db:migrate --workspace apps/api
npm run smoke:offline
npm run verify:v03
npm test
npm run build
```

Run in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Frontend: `http://localhost:5173` · Health endpoint: `http://localhost:4000/api/v1/healthz`.

**On an existing v0.2 development database**, back up the database and uploaded files before migration. The migrator applies SQL files `001`, `002` and `003` idempotently where applicable, but this is not a substitute for a reviewed schema upgrade in staging. Existing evidence rows remain `SUBMITTED` and require re-review before advancement. Do not run against production data.

## Real integration smoke test

The following command **creates fictional users, organizations, a land asset, a verification case and a small synthetic PDF** in your running local database. It is deliberately gated and refuses non-local hosts.

```bash
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:e2e:local
```

It checks registration/login, organization separation, case creation, missing-evidence rejection, self-review rejection, team invitation and acceptance, case assignment, independent review, stage advancement, and document SHA-256 upload/download integrity. If it fails, preserve the full API and test logs and correct the cause; do not treat the checkpoint as passing.

CI reference: `.github/workflows/ci.yml` runs npm installation, unit checks, builds, fresh PostgreSQL migrations and the local HTTP smoke suite in a GitHub Actions runner. **CI has not been run in this handoff environment.** A lockfile and dependency security review should be added before a production pipeline.

## Offline-only commands

```bash
npm run smoke:offline
npm run verify:v03
node tools/render-static-preview.cjs
```

Offline helper checks are **not replacements for NestJS/PostgreSQL tests**. The static renderer is not the real React/Vite runtime; it is a source-derived visual preview only.

## Quick negative tests to add before production

- Cross-tenant requests on every API resource, including documents, tasks, disputes, quotes and report exports.
- Expired and revoked access grants, invitation replay and stale JWTs.
- Reviewer attempting self-approval, unaccredited approval, review of another stage and review of a blocked case.
- Concurrent evidence-review and stage-advance requests, including multiple assignees and a dispute reported mid-review.
- File upload timeout, DB transaction rollback, disguised MIME type, malware, oversized uploads, unavailable storage and cryptographic digest mismatch.
- Anti-enumeration, rate limiting, session replay, password reset and MFA.
- Professional legal/source verification, stale searches, dispute escalation, record corrections and reporting requirements.
- Automated backup restore, incident response, monitoring, failure injection and load testing.

## Known release blockers

No live Ubuntu/Kali npm build or PostgreSQL tests were executed inside the authoring container due to missing dependencies, Docker and a running database. This checkpoint is **not production-certified**. Privileged sessions, private object storage, professional accreditation, government integration, payments and independent blockchain anchoring remain open workstreams.
