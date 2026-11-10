# AssetTrust — master product requirements and delivery coverage

**Compiled for Aturinzire Hargreave | Version 0.2 | Uganda-first**

## Product objective

Provide a secure **evidence-management and due-diligence coordination platform** for land and valuable assets. Users may document their claims, attach supporting files, commission appropriate checks, collaborate with qualified professionals, identify inconsistencies, and obtain a clearly labeled **non-official evidence summary**. AssetTrust is **not a registry of legal title, a court, a licensed law firm, or an official certificate issuer**.

### Terminology that must never be blurred

- **Declared owner**: party claimed by a submitter; not independently established.
- **Integrity checked**: bytes match the stored SHA-256 fingerprint; not proof of document authenticity.
- **Evidence received**: source and observations recorded; not the source being verified.
- **Review complete**: platform process reached the end; not a government guarantee of ownership.
- **Official registry evidence**: an authorized search letter or record from the relevant office, with date and source; recorded as external evidence, never faked.
- **Local audit commitment**: local cryptographic fingerprint; **not** a public or permissioned blockchain receipt.

## Coverage legend

- **CODED**: implemented in the v0.2 source; runtime integration still needs verification.
- **PARTIAL**: UI/scaffolding or a limited implementation; production controls missing.
- **PLANNED**: not in source; implementation and verification are required.
- **EXTERNAL**: requires institutional approval, provider integration, or independent qualification.

## A. Identity, membership and access

| ID | Requirement | v0.2 coverage |
|---|---|---|
| IAM-01 | Register a separate organization workspace | CODED |
| IAM-02 | Passwords hashed with Argon2id | CODED |
| IAM-03 | JWT bearer login with expiry and identity lookup | CODED |
| IAM-04 | Invitation-based team joining with expiry and single-use tokens | CODED |
| IAM-05 | Role separation among client, reviewer, surveyor, legal reviewer and admin | CODED |
| IAM-06 | Default all professional accounts to unapproved status | CODED |
| IAM-07 | Independent professional license/accreditation review and renewal | EXTERNAL |
| IAM-08 | Temporary intra-organization asset access grants | CODED |
| IAM-09 | Authenticated record-level checks for core asset/case/document reads | CODED |
| IAM-10 | MFA for admin, financial, and professional approvals | PLANNED |
| IAM-11 | Secure HttpOnly session cookie and CSRF design | PLANNED |
| IAM-12 | SSO/OIDC for institutions | PLANNED |
| IAM-13 | Segregated platform super-admin vs. organization admins | PLANNED |
| IAM-14 | Session/device inventory, revocation, and anomaly alerts | PLANNED |

## B. Asset registration and ownership assertions

| ID | Requirement | v0.2 coverage |
|---|---|---|
| AST-01 | Register land, buildings, vehicles, machinery, cooperative assets | CODED |
| AST-02 | Capture district, declared owner, parcel reference, tenure, acreage | CODED |
| AST-03 | Search, list, and access-controlled asset profiles | CODED |
| AST-04 | Distinguish claimed details from sourced verification evidence | PARTIAL |
| AST-05 | Support Mailo, Freehold, Leasehold, Customary and special interests | PLANNED |
| AST-06 | Support multiple claimants/beneficiaries without overwriting history | PLANNED |
| AST-07 | Treat probate, spousal interest, guardianship and corporate authorization as separate checks | PLANNED |
| AST-08 | Asset hierarchy for land, plots, subdivisions, buildings, equipment | PLANNED |
| AST-09 | Ownership history as dated claims with evidence and provenance | PLANNED |
| AST-10 | Immutable corrections and superseded-record traceability | PLANNED |
| AST-11 | Duplicate-risk review, never automatic rejection without evidence | PLANNED |
| AST-12 | Securely record consent and authority to share documents | PLANNED |

## C. Verification cases, work allocation and disputes

| ID | Requirement | v0.2 coverage |
|---|---|---|
| CASE-01 | Create a case linked to an accessible asset | CODED |
| CASE-02 | Ordered stages: intake → documents → registry → field → legal → final | CODED |
| CASE-03 | Require matching evidence type before stage advancement | CODED |
| CASE-04 | Require accredited role for protected professional stages | CODED |
| CASE-05 | Assign a case to an organization member | CODED |
| CASE-06 | Create and complete accountable case tasks | CODED |
| CASE-07 | Record dispute category, narrative, status and resolution | CODED |
| CASE-08 | Block workflow advancement while dispute unresolved | CODED |
| CASE-09 | Preserve case stage and dispute audit history | CODED |
| CASE-10 | Assign separate preparer, reviewer and final approver | PLANNED |
| CASE-11 | Conflict-of-interest declarations and two-person approvals | PLANNED |
| CASE-12 | Due-date escalation and service-level monitoring | PARTIAL |
| CASE-13 | Scope-of-work selection and independent legal/survey reports | PLANNED |
| CASE-14 | Appeal procedure with evidential review and dispute reopening policy | PLANNED |
| CASE-15 | Customer consent capture for site visits and identity checks | PLANNED |

## D. Documents, evidence and reports

| ID | Requirement | v0.2 coverage |
|---|---|---|
| DOC-01 | Private PDF/image upload with size and signature checks | CODED |
| DOC-02 | SHA-256 digest stored and rechecked on download | CODED |
| DOC-03 | Authenticated tenant and record-scoped document access | CODED |
| DOC-04 | Record evidence source, observations, timestamp, actor, stage | CODED |
| DOC-05 | Show non-official evidence summary and print-to-PDF action | CODED |
| DOC-06 | Document review state and rejection reason workflow | PARTIAL |
| DOC-07 | Encrypted private object storage + key rotation | PLANNED |
| DOC-08 | Malware scanning, quarantine and content disarm | PLANNED |
| DOC-09 | OCR as untrusted suggestion requiring human confirmation | PLANNED |
| DOC-10 | Evidence citations with issuer, retrieval method and search date | PARTIAL |
| DOC-11 | Versioned signed non-official professional reports | PLANNED |
| DOC-12 | Public verification portal revealing minimal permitted metadata | PLANNED |
| DOC-13 | Consent-aware QR links, revocation, expiry and anti-enumeration | PLANNED |
| DOC-14 | Retention, deletion, legal hold and data-subject request process | PLANNED |
| DOC-15 | Secure export of a customer's own records | PLANNED |

## E. Geospatial and official data

| ID | Requirement | v0.2 coverage |
|---|---|---|
| GEO-01 | Geospatial visual UI for asset detail | PARTIAL (design reference) |
| GEO-02 | Store survey geometry with CRS, precision, source and date | PLANNED |
| GEO-03 | Self-hosted map tile/provider adapter where licensing permits | PLANNED |
| GEO-04 | Visualize parcels and overlaps as alerts, not legal determinations | PLANNED |
| GEO-05 | Mobile field notes, photos, and offline synchronization | PLANNED |
| GEO-06 | Authorized official land record search integration | EXTERNAL |
| GEO-07 | Track registry response identifier and provenance | PLANNED |
| GEO-08 | Distinguish government data, surveyor data and claimant data | PLANNED |
| GEO-09 | Officially validated title or transfer status | EXTERNAL |

## F. Cryptographic integrity and blockchain

| ID | Requirement | v0.2 coverage |
|---|---|---|
| CRY-01 | Append-only event hash chain in database transactions | CODED |
| CRY-02 | Admin integrity-verification endpoint | CODED |
| CRY-03 | Export local chain-head commitment | CODED |
| CRY-04 | Configurable external anchoring adapter | PLANNED |
| CRY-05 | Batch Merkle roots, independent receipts and verifier CLI | PLANNED |
| CRY-06 | Public/permissioned blockchain selection study | PLANNED |
| CRY-07 | Never store private ownership documents on public chain | POLICY REQUIRED |
| CRY-08 | Key lifecycle and independently verified document signatures | PLANNED |
| CRY-09 | Independent anchor status, failure handling, retries and reconciliation | PLANNED |

## G. Commercial and billing

| ID | Requirement | v0.2 coverage |
|---|---|---|
| BILL-01 | Illustrative professional service packages | CODED |
| BILL-02 | Create scope-based UGX verification quotes | CODED |
| BILL-03 | Separate government, legal and survey fees in quotations | PARTIAL (text only) |
| BILL-04 | Quote status transitions and audit history | CODED |
| BILL-05 | Formal invoicing, taxes, receipts and credit notes | PLANNED |
| BILL-06 | Integration with approved local payment channels | EXTERNAL |
| BILL-07 | Financial ledger, reconciliation, refunds and settlements | PLANNED |
| BILL-08 | Subscriptions, entitlements, metering and institutional procurement | PLANNED |
| BILL-09 | Fraud/risk controls around financial actions | PLANNED |
| BILL-10 | Country/currency/tax-adapter for future regional launch | PLANNED |

## H. Governance, monitoring and operations

| ID | Requirement | v0.2 coverage |
|---|---|---|
| OPS-01 | In-app notifications for assignments, tasks and disputes | CODED |
| OPS-02 | Per-asset manual review reminders | CODED |
| OPS-03 | Integration readiness page with explicit disabled status | CODED |
| OPS-04 | Audit admin view of recent per-tenant events | CODED |
| OPS-05 | Production API readiness checks for database and dependencies | PLANNED |
| OPS-06 | Job processing, alerts, retries and dead-letter queue | PLANNED |
| OPS-07 | Structured logs, tracing, dashboards and SLO monitoring | PLANNED |
| OPS-08 | Automated migrations, backups, restore drills | PLANNED |
| OPS-09 | Full data-protection assessment with legal counsel | EXTERNAL |
| OPS-10 | Security incident response and regulator notification process | PLANNED |
| OPS-11 | Security training and institution onboarding | PLANNED |
| OPS-12 | Multi-country tenancy and data-residency architecture | PLANNED |

## I. Non-functional acceptance targets (goals, NOT measurements)

| Category | Proposed measurable target | Evidence required |
|---|---|---|
| Availability | >= 99.9% monthly after GA, excluding agreed maintenance | Monitored uptime history |
| API latency | <= 500ms p95 for standard reads at the agreed pilot volume | Load tests against staging |
| Mobile usability | Functional at 360px width, keyboard accessible | Manual + automated accessibility tests |
| Authorization | Deny all cross-tenant and unauthorized record reads | Adversarial integration tests |
| Audit integrity | Detect any change of historical event payload or predecessor | Deterministic tamper suite |
| Data recovery | Document RPO and RTO approved by the organization | Backup + restore exercises |
| Sensitive data | Private by default, encryption at rest and in transit | Independent security review |
| Case consistency | Cannot advance without corresponding current-stage evidence | Transactional concurrency tests |
| Offline field use | No loss or duplication on reconnection | Network partition tests |
| Release quality | Automated unit, integration and end-to-end regression | CI/CD artifacts |
| Privacy | Proven consent, minimization and deletion/retention flows | Legal/privacy review |

## MVP and later releases

**Current v0.2:** working-code foundation and testable business endpoints, but not yet end-to-end tested against a live DB in this environment. **Pilot candidate:** add PostgreSQL integration coverage, independent professional vetting, approved storage, malware scanning, stronger sessions, and controlled access to official evidence. **Commercial GA:** compliance/security signoff, financial settlement, observability, tested backup/restore, incident operations and customer support. **Regional expansion:** additional asset classes and country-aware legal/land tenure policies after pilots.

The requirements list is a coverage map, not a claim that a government registry has been integrated or that a legal institution has approved the product.
