# AssetTrust v0.3 — Evidence governance and decision controls

**Compiled for Aturinzire Hargreave · 6 November 2026**

## Why this milestone exists

Previously the case workflow advanced whenever it found *an evidence row with the expected type*. A typed assertion by an employee was therefore enough to mark a due-diligence stage complete. This is not an acceptable verification rule. In v0.3 every stage requires a **separately reviewed and accepted** evidence row before advancing.

This is a **review of evidence submitted to the private platform**, not independent authentication against Uganda's official title register. Review cannot prove the underlying claim true; neither a verified document digest nor an accepted review confers legal ownership.

## State machine

1. The assigned reviewer or organization administrator submits an evidence entry for the **current** case stage. Stage, type, source, observations and identity are recorded. Later stages require a nonempty document/search/inspection reference.
2. New evidence is `SUBMITTED` by default, even when attached to a genuine-looking document.
3. An **authorized second account** with appropriate role examines the entry and writes a nonempty review note. The original submitter cannot review their own entry.
4. A review decision is permanently recorded as `ACCEPTED` or `REJECTED`; the reviewer ID, time and note are retained. A review cannot overwrite a finalized decision. If evidence is rejected, submit a new entry rather than editing the old one.
5. A case may advance only if a current-stage entry of the required type is accepted by another account, the case is not blocked, no active dispute exists and the stage-appropriate role authorizes advancement.
6. Audit events `EVIDENCE_ADDED`, `EVIDENCE_REVIEWED` and `CASE_STAGE_ADVANCED` record the change in the local hash chain. The hash chain is not externally anchored.

## Evidence required at each stage

| Current stage | Evidence type to independently accept | Role for current-stage advancement | Allowed evidence reviewer |
|---|---|---|---|
| `INTAKE` | `IDENTITY` | Organization admin or reviewer | Organization admin or reviewer, different from submitter |
| `DOCUMENT_REVIEW` | `DOCUMENT` | Organization admin or reviewer | Organization admin or reviewer, different from submitter |
| `REGISTRY_SEARCH` | `REGISTRY_SEARCH` | Organization admin or reviewer | Organization admin or reviewer, different from submitter |
| `FIELD_INSPECTION` | `FIELD_REPORT` | Approved surveyor or approved admin | Approved surveyor or approved admin, different from submitter |
| `LEGAL_REVIEW` | `LEGAL_OPINION` | Approved legal reviewer or approved admin | Approved legal reviewer or approved admin, different from submitter |
| `FINAL_REVIEW` | `DECISION` | Approved organization administrator | Approved administrator or approved legal reviewer, different from submitter |

**Accreditation note:** The `professional_approved` flag cannot be self-enabled through the UI. An authorized out-of-band vetting and approval process must be designed, audited and legally reviewed before those final stages can be used with real clients. This prototype has no government accreditation integration.

**Assignment note:** Only the case assignee or administrator can submit evidence and advance stages. A separate authorized reviewer must have access to the case (e.g., admin or a valid contribution grant) to make the review decision.

## Data and API changes

`003_evidence_review.sql` adds `review_status`, `reviewed_by`, `reviewed_at`, `review_notes` and an index. Existing v0.2 evidence defaults to `SUBMITTED`; the migration **does not backfill false approvals**. Previously completed cases must be re-evaluated manually if their evidence is to count as independently reviewed. Historical events are preserved.

Endpoints:

- `GET /api/v1/cases/:id/evidence` now returns review decision fields.
- `POST /api/v1/cases/:id/evidence/:evidenceId/review` accepts `{"decision":"ACCEPTED"|"REJECTED","reviewNotes":"..."}`.
- `POST /api/v1/cases/:id/advance` returns HTTP 409 if the appropriate evidence has not been independently accepted.
- `GET /api/v1/reports/case/:id` includes evidence review metadata and an explicit manual-assurance level.

## Threats not solved by this milestone

- Two accounts may still be controlled by the same real person. Independent human identity, conflicts of interest and professional licensing require further governance.
- A reviewer may accept incorrect evidence. Need authoritative registry searches, source validation, third-party corroboration, appeal procedures and spot audits.
- Back-office database operators can edit/delete records; the local audit chain alone is not a full immutable legal ledger. Need off-host signed checkpoints, monitored backups and independent anchoring.
- Document storage is local filesystem without malware scanning, object-store encryption/key rotation or a tested retention/deletion policy.
- Access tokens are still stored client-side; phishing/MFA/session management are not hardened.
- No official title certificate, licensed legal opinion, cash settlement, or compliance certification is generated.

## Mandatory business controls before pilot

Define official-vs-private verification labels, approve a professional licensing/vetting protocol, bind reviewer accounts to verified people, document conflict-of-interest rules, protect personal information under Uganda law, and obtain written access permissions for any authoritative registry integration. Confirm these requirements with qualified Uganda legal and privacy counsel.
