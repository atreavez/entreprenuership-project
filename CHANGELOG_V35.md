# AssetTrust v0.35 — Governed Report Withdrawal

**Purpose:** safely withdraw a previously issued private evidence report when serious concerns arise, without erasing or modifying its original evidence record. This extends the v0.34 issuance and QR verification checkpoint.

## Delivered

- New versioned PostgreSQL migration `015_report_withdrawal.sql` with tenant-matching composite foreign keys, unique pending withdrawal per report, one final withdrawal per report, independent approval constraints, irreversible proposal decisions, and append-only approved withdrawals.
- New domain rule `assertWithdrawalReason`, interim public `UNDER_REVIEW` while a withdrawal is pending, and deterministic final public state `WITHDRAWN`, which takes priority over supersession and disputes. Tamper-check failure remains highest-priority.
- Two-administrator workflow: an active org administrator with recent MFA proposes a private reason; a *different* current org administrator with fresh MFA approves or rejects it. A previously suspended proposer is disqualified. Both transitions are audited.
- Private administration endpoints for proposing and deciding withdrawals. Public verification returns only reference/status/issue date/hash and a non-official notice, never withdrawal reasons or personal evidence.
- Admin UI section to request withdrawal and approve/reject queued requests; public verification displays conspicuous "WITHDRAWN — do not rely" messaging. Public route explicitly sets `Cache-Control: no-store`.
- Disposable PostgreSQL migration-contract test, v0.35 offline tests, CI wiring and Kali runbook.
- Repaired legacy tests that incorrectly required an exact total of 14 migrations; all historical SQL fingerprints are preserved.

## Limits and release decision

**DEVELOPMENT ONLY — NOT PRODUCTION READY.** New v0.35 offline tests pass. A real dependency install/compiled API and React app, live PostGIS migration, authenticated HTTP/browser flows and production hardening are not verified in this workspace. CI must complete before release. The withdrawal trigger does not protect against superuser/DBA intervention; off-platform immutable backups/signatures and recipient notifications are not yet implemented. No official land registry verification, ownership certification, legally qualified signature or government endorsement is implied.
