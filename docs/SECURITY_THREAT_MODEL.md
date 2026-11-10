# AssetTrust security and trust-boundary review — v0.2

**Status:** design-time assessment; not a penetration-test certificate.

## Protected assets

User identity and contact information; claimed ownership details; uploaded titles, identity files, reports, and site photographs; unverified accusations and disputes; professional credentials; subscription quotes; audit events; invitation tokens; service keys; private database and file backups.

## Trust boundaries

1. **Browser → API:** browser input is untrusted; API validates, authenticates, authorizes and rate-limits. UI hiding a button is not security.
2. **Organization A → Organization B:** no cross-tenant resources. Every query must carry the principal's verified organization ID.
3. **Workspace staff → individual property:** membership is not universal read access. Enforce ownership, case assignment, or time-limited grants on each operation.
4. **Submitted file → trusted evidence:** MIME signature and SHA-256 are integrity controls, not issuer verification or malware safety. Quarantine future upload storage.
5. **Human observations → official records:** manually entered registry results remain assertions about a search; official integration requires written approval, audit and source verification.
6. **Local ledger → independent trust:** a database hash chain is locally tamper-evident, not independent notarization; separately anchor commitments and retain receipts.
7. **Professional role → professional authority:** selecting surveyor/lawyer role does not validate credentials. Independent vetting and expiry tracking required.
8. **Service quote → funds:** quotes do not establish payment, escrow, receipt or legal financial custody.

## Abuse cases and controls

| Threat | Existing mitigation | Essential unfinished control |
|---|---|---|
| Tenant A accesses Tenant B asset by guessing UUID | Tenant conditions and resource checks in API | Automated cross-tenant endpoint suite; PostgreSQL RLS defense in depth |
| Client reads another member's title within same organization | Asset/case/document record checks and time-limited grants | Comprehensive endpoint authorization matrix and external security review |
| Spoofed title uploaded then marked “verified” | UI uses declared-owner/evidence language; no official certificate | Independent source authenticity, licensed professional review, issuer verification |
| Request races case advancement | Transaction lock for advancement and evidence stage | Full concurrency and serializable integration tests |
| Reviewer fabricates a completed professional step | Role+professionalApproved gate | Approval ledger, time-limited credentials, separation of duties |
| Malicious PDF or media upload | MIME allowlist, signature checks and 5MB limit | Sandboxed malware scanning, encrypted object storage, thumbnail security |
| Credential stuffing/password reuse | Argon2id, global throttling and shorter auth throttles | MFA, suspicious-login alerts, user lockout policy and device tracking |
| Invitation token interception | Random 32-byte one-time token, hashed at rest, 48h limit | Approved secure delivery, invitation revocation, monitoring and short-lived links |
| Browser token theft via XSS | Limited expiry, React escaping, Helmet on API | HttpOnly/CSRF session migration and strict CSP / content handling |
| Audit chain replacement by DBA | Hash chaining and per-org lock | Independent notarization, immutable external checkpoint, split-key custody |
| Bogus registry integration endpoint | Explicit NOT_CONNECTED status | Provider audit, allowlisted data sources, signed service contracts |
| Reputational attack through false disputes | Private, attributed, tenant-scoped dispute reports | Evidence rules, investigation workflows, respondent rights, appeals |
| Accidental public data sharing | No anonymous public endpoints; intra-org access grants | Consent and purpose enforcement, public link expiry, DLP review |
| Unauthorized payment receipt issuance | No live payment API | Provider signatures/webhooks + double-entry ledger and reconciliation |

## Existing limitations to resolve before real data

- Browser stores JWT in `sessionStorage` for this scaffold. Implement secure session cookies, anti-CSRF controls, MFA, user-visible session termination and token revocation.
- The local filesystem is not equivalent to encrypted, malware-scanned institutional document storage. Implement private encrypted object storage, scanning, retention and backup.
- `professional_approved` is currently a trusted database flag. Production needs documented accreditation workflow, separation of duties and change auditing outside an org admin's ordinary permissions.
- This code has not passed live PostgreSQL integration tests here. SQL injection prevention, cross-record checks, race handling and migration behavior require end-to-end verification.
- Audit hash verification cannot prevent an operator with full database access from regenerating the chain. An independently controlled external commitment service is required for stronger tamper evidence.
- Event logs should not contain national identification numbers, passwords, full document bytes, financial secrets or sensitive dispute details beyond necessity.
- Conduct a Uganda-specific data-protection and legal review with qualified counsel before using personal records, and confirm notices, consents, retention policy and breach response.

## Threat-model acceptance tests

- Test two organizations plus two ordinary staff accounts in the same organization.
- Confirm forbidden GET and POST access to unrelated assets, cases, files, task lists, reports, grants, disputes and private metadata.
- Confirm unauthenticated requests and reused/expired invitation tokens are rejected.
- Confirm a non-accredited surveyor/lawyer cannot advance professional stages.
- Confirm a blocked case cannot advance or accept new evidence until its unresolved dispute is handled.
- Confirm a document with one changed byte fails its SHA-256 check.
- Confirm an audit event modified in the DB fails chain validation.
- Confirm expired access grants no longer authorize reads or writes.
- Confirm actions that fail rollback their data and audit records together.

## Approval gates

**NO REAL CUSTOMER DOCUMENTS** until independent code review, end-to-end verification, security architecture approval, and a privacy assessment are completed. **NO OFFICIAL VERIFICATION CLAIMS** until an authorized authoritative data or professional process is formally defined. **NO PAYMENTS** until legal, payment provider, settlement and accounting controls are verified.
