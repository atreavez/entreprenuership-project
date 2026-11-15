# AssetTrust v0.34 — Verification Report Issuance Architecture

**Scope:** private non-official evidence report issuance with two-administrator approval, versioned snapshots and minimal public reference verification. No official registry integration and no legal certification.

## Domain boundaries

- `apps/api/src/contexts/report-issuance/domain/report-policy.ts`: pure issuance policy and deterministic snapshot serialization. Does not know about PostgreSQL, NestJS, HTTP or React.
- `apps/api/src/contexts/report-issuance/infrastructure/report-issuance.module.ts`: PostgreSQL transactions, current administrator MFA step-up, tenant checks, snapshot and template acquisition, audit records, public verification.
- `apps/api/sql/014_report_issuance.sql`: foreign keys, immutable issued-row trigger, independent approval, unique active lineage.
- `apps/web/src/ReportIssuancePage.tsx`: authenticated administrator workflow, proposal decisions, issued report history and locally generated verification QR.
- `apps/web/src/PublicReportVerificationPage.tsx`: read-only, unauthenticated verification metadata. The public route uses an unguessable UUIDv4 reference and no private data.

## Workflow

1. A current organization administrator with recently verified MFA selects a CLOSED case, specifies a 12–500 character reason, and proposes issuance. Source records are locked, then the case, all six independently accepted evidence requirements, no active dispute, and the approved report summary are checked. A deterministic snapshot is built and SHA-256 hashed. **No report is issued yet.**
2. Another current administrator with fresh MFA examines the proposal and decides. The approving transaction locks the case and the proposal, rechecks the author's appointment, case status, dispute status, evidence and published text; a changed snapshot blocks issuance.
3. On approval a new `issued_verification_reports` row is inserted, an audit event is written, and the proposal is marked ISSUED within the same database transaction. Rejection only records the decision and audit event.
4. The issued report has a random UUIDv4 reference. The browser builds a QR code locally from the same-origin public verification URL `/#verify/report/<uuid>` using `qrcode.react`. The QR library does not use a remote QR-image service.
5. A public visitor can check only record existence, local snapshot-hash consistency, issue date and state. If the case is reopened or a dispute is active, the result becomes `UNDER_REVIEW`; if a newer report supersedes it, `SUPERSEDED` takes precedence.

## Protected fields and correction model

The private snapshot stores the case/asset identifiers and accepted evidence details at approval time. It is NOT publicly served. The issue timestamp, approving actor, proposal, and snapshot fingerprint are separate immutable record metadata. The SHA-256 digest is **local tamper evidence**, not an external signature or proof the entered facts are true. A report's content must not be overwritten: a revised report must reference the older version and pass the independent approval workflow again.

The SQL trigger blocks UPDATE and DELETE on issued records for normal application operations. A database administrator with powerful privileges could still modify database state or disable a trigger; this is not immutable in the absolute or blockchain sense. External anchors, signed reports, independent backups, and secure archival remain future work.

### Administration boundaries

- `ORG_ADMIN` may propose, review or list reports only within their own organization; a current unrevoked session, active MFA credential and recent step-up are checked under row locks.
- An author cannot approve their own proposal. Both administrators must remain active. An ordinary member cannot promote themselves or edit immutable report snapshots.
- Report summary wording uses only *published*, allowlisted organization template `report.summary` from v0.31. Pending template edits cannot issue a report. Every version must retain the fixed non-official notice.
- Public verification does not include organization name, declared owner, case reference, asset reference, underlying evidence or private report snapshot.

## Endpoints

| Method | API path | Access | Function |
|---|---|---|---|
| GET | `/api/v1/reports/issued` | Current organization admin + MFA | Organization proposals and issued report index |
| POST | `/api/v1/reports/issued/proposals` | Current organization admin + fresh MFA | Propose issuance / explicit supersession |
| POST | `/api/v1/reports/issued/proposals/:id/decision` | A different current admin + fresh MFA | Approve and issue or reject |
| GET | `/api/v1/reports/issued/:id` | Current organization admin + MFA | Private issued snapshot, fingerprint status |
| GET | `/api/v1/reports/verify/:id` | Public, throttled | Reference/status/date/hash only |

## Explicit release blockers and limitations

- **No complete dependency build or live database execution** in this environment. The presence of SQL, TypeScript, and tests does not prove production database integration.
- The new `qrcode.react` frontend dependency needs an authentic reviewed npm lockfile. SVG generation has not been executed in the actual React bundle here. Offline screenshots include a **locally generated QR for fictional demonstration data**.
- No PDF renderer, qualified digital signature, external anchoring, durable independent archival, formal legal opinion issuance, government registry read/write, or emergency cancellation/revocation workflow. These must not be misrepresented as included.
- The public reference is an opaque identifier, not an authentication credential. Do not embed private owner data or document URLs in QR payloads.

## Architecture acceptance criteria for future stages

Versioned admin controls must keep global Platform Super Admin settings separate from organization-scoped permissions. All operating settings should be configurable through approved interfaces as appropriate; immutable evidence and audit guarantees cannot be overridden by ordinary admin settings. Future PDF signature and key-provider modules should use replaceable ports, least-privilege secret handling, key rotation and explicit approvals.
