> **Historical starter document.** See `docs/GEOSPATIAL_V08.md`, `docs/IDENTITY_SECURITY_V05.md`, `docs/ARCHITECTURE_V06_PROFESSIONAL_TRUST.md`, and `docs/SECURE_DOCUMENT_VAULT_V07.md` for the current architecture. Some statements below describe older prototypes and are no longer correct.

# AssetTrust — Implementation Architecture

**Compiled for Aturinzire Hargreave**

## 1. Boundary diagram

```text
USER BROWSER (mobile or desktop)
          |
 React application (TypeScript / Vite)
  - authentication / navigation / forms
  - asset and case management
  - document vault / report views
          |
       HTTPS/JSON
          |
 NestJS API (TypeScript)
  | Auth, tenant identity and authorization
  | Asset application service
  | Case workflow and evidence service
  | Private document service
  | Audit event service
  | Non-official report/read model
  | Billing plan catalogue
          |
          +--> PostgreSQL (tenant-scoped relational records)
          |
          +--> Private upload directory (prototype; replace with encrypted object storage)
          |
          +--> Future authorized adapters:
                  registry / survey evidence / external anchoring /
                  payments / communication
```

## 2. Core entities

| Entity | Key fields | Relationships |
|---|---|---|
| Organization | id, name | Has users, assets, cases, documents, audit events |
| User | id, organization_id, role, professional_approved | Creates assets and evidence, owns login |
| Asset | id, asset_code, asset_type, district, declared_owner, status | May have cases and documents |
| VerificationCase | id, case_code, asset_id, stage, status | Contains ordered stage evidence |
| Evidence | case_id, stage, evidence_type, observations, source_name, reference, recorded_by | Attributed human record within a case |
| Document | organization_id, asset_id or case_id, SHA-256, random private filename | Uploaded by authenticated member |
| AuditEvent | organization_id, event_sequence, previous_hash, event_hash | Linked hash history within tenant |

Every API read and write involving user-owned data is constrained by `organization_id` in the query or validation. **This is necessary but not sufficient** for institutional access: row-level delegation and case assignment authorization are still needed.

## 3. Roles and stage authorization

| Stage being completed | Required evidence | Permitted role |
|---|---|---|
| Intake | IDENTITY | Org admin or reviewer |
| Document review | DOCUMENT | Org admin or reviewer |
| Registry search | REGISTRY_SEARCH | Org admin or reviewer; record remains a sourced claim |
| Field inspection | FIELD_REPORT | Approved surveyor or approved org admin |
| Legal review | LEGAL_OPINION | Approved legal reviewer or approved org admin |
| Final review | DECISION | Approved org admin |

`professional_approved` is false for every self-registered user. In a production deployment it must only be set by a separate, independently governed accreditation process. Do not mistake workflow completion for verification of legal ownership.

## 4. Authentication and authorization

- Passwords: Argon2id (never store plaintext).
- JWT: HMAC-signed, audience/issuer checked, 8-hour expiry.
- Registration: creates an organization and an initial organization admin (organization-local only).
- Tenant boundary: authenticated organization ID from the token's verified subject lookup, never trusted from request body.
- Internal authorization: server-side role checks on case evidence and transitions.
- Known gap: browser currently retains a bearer token in sessionStorage for an easily runnable starter; production should use HttpOnly cookies or a properly designed session model, MFA, CSRF protection and stricter action policies.

## 5. Document integrity

The API refuses missing or malformed document targets, checks permissible file content signatures, stores with a random filename in a private directory, records a SHA-256 digest and checks digest before authenticated download.

This proves bytes have not changed relative to the recorded digest. It does **not** authenticate the original issuer or the legal content. For production, move to an encrypted object-storage adapter, scan files for malware, add quarantine/release rules, granular download access policies, retention and deletion workflows, and backup protections.

## 6. Audit chain

Audit writes run in the same database transaction as asset/case/evidence writes. Each event hashes its organization ID, actor ID, action, entity ID, sorted event details, timestamp and previous hash. Transactional advisory locks serialize the per-organization history.

`GET /audit/verify` recalculates the local chain. Without independent notarization, an attacker with full database write privileges could replace an entire chain. A future anchoring adapter should periodically commit a Merkle root or chain head to an independent service, retain receipts, and expose proof verification. That is a separate milestone.

## 7. Deployment roadmap

1. Run and test migrations on a disposable PostgreSQL database.
2. Run actual NestJS API unit/integration tests, including cross-tenant authorization and malformed uploads.
3. Deploy only fictional data to a staging environment with TLS and monitoring.
4. Add a verified professional directory, two-person approvals, organization management and invitations.
5. Add encrypted storage, file-scanning workers and download/retention policy controls.
6. Add official-land-data integrations only after contractual and technical authorization.
7. Add an evidence-based report signing/verification service with issuer authority rules.
8. Add payment processing, ledgering and reconciliation after selecting authorized providers.
9. Independent security assessment, legal review, training and an operational pilot.

## 8. UI implementation note

The static screenshot previews were generated by rendering the actual React TSX element tree with fake fixture data through a custom lightweight offline renderer. The renderer does not simulate real React event handling. For interactive testing and handoff, install dependencies and run the Vite development server in either read-only preview mode or with the real API.
