# Professional trust operations (developer/staging guide)

**Compiled by:** Aturinzire Hargreave

### 1. Environment & migration

Run in a dedicated development environment, not a production property database:

```
cp .env.example .env
# Configure DATABASE_URL and long random, distinct JWT_SECRET and MFA_ENCRYPTION_KEY
docker compose up -d postgres
npm install
npm run db:migrate --workspace apps/api
npm run verify:v06
npm run verify:v03
npm run verify:v04
npm run verify:v05
npm run build
```

### 2. Accounts / organization separation

Create an applicant organization and invite an appropriately qualified account with role `SURVEYOR` or `LEGAL_REVIEWER` (ordinary org admins cannot claim either professional role). Create two reviewer accounts in other organizations with their own credentials. All reviewers must enable authenticator MFA and keep recovery codes offline. Different reviewers must have different user IDs. As a stronger operational policy, have reviewers supervised by separate persons/teams and independently check original regulator sources.

### 3. Trusted reviewer appointment (NOT via web/API)

Platform staff appointment requires an approved operator change ticket, controlled database access, verified personal MFA, and an operator name. Example:

```
TRUST_REVIEWER_BOOTSTRAP_APPROVED=yes npm run trust:operator -- --action appoint \
  --user-id '00000000-0000-4000-8000-000000000001' \
  --reference 'APPROVED-SECURITY-TICKET-1234' \
  --operator 'Authorized infrastructure operator' --confirm
```

Replace the sample UUID with a real, MFA-enabled reviewer account ID. Repeat for the second, independently authorized reviewer. The CLI needs direct PostgreSQL access; never run it from a web client or expose it as an HTTP operation. Keep the underlying change-ticket proof offline and under access control.

To disable access quickly:

```
TRUST_REVIEWER_BOOTSTRAP_APPROVED=yes npm run trust:operator -- --action disable \
  --user-id '00000000-0000-4000-8000-000000000001' \
  --reason 'Documented staff access revocation following personnel change' \
  --operator 'Authorized infrastructure operator' --confirm
```

### 4. Professional application

Applicant submits regulator, registration reference, expiration, jurisdiction and supporting explanation via the `Professional Trust` page. The account remains **unapproved**. An optional supporting document must already exist as a private upload by the applicant. There is no automatic professional licence validation in this release.

### 5. Independent review

Reviewers sign in, open Professional Trust and use the `Verify MFA` control to provide a new code. Within 15 minutes, they may view applications from unrelated organizations. They must actually confirm the claim via an authoritative external licensing channel and record method, official reference and notes. Two separate VERIFIED attestations grant a role-specific, expiring internal accreditation. Any one REJECTED attestation closes the claim.

### 6. Expiry and revocation

The AuthGuard reloads a fresh user principal, computing `professionalApproved` from active accreditation and matching role. Expired / revoked grants are no longer authorized. Incident revocation uses `POST /api/v1/professional/users/:id/revoke` by a platform reviewer following fresh MFA, with a written reason and auditable record. A more formal dual-control revocation system should be introduced for regulated production use.

### 7. Manual / automation testing

- Verify `GET /professional/me` is scoped to the signed-in user.
- Confirm anonymous/no-MFA sessions cannot see review queue or attest.
- Confirm applicant and fellow employees cannot vote.
- Confirm one vote remains PENDING; second distinct external vote APPROVES; one rejection REJECTS.
- Confirm unapproved, revoked or expired professionals cannot review field/legal evidence.
- Confirm no client can invoke reviewer appointment through HTTP.
- Run route-level and PostgreSQL transaction tests against an isolated test database before any staging deployment.

The v0.6 offline test scripts are not replacements for live DB tests, security assessment, or real regulator checks.
