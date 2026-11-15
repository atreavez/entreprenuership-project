# AssetTrust v0.29 — Member Governance & Permission Catalogue

Compiled by Aturinzire Hargreave.

### Added
- Dedicated organization Members & Permissions console with responsive desktop/mobile UI.
- Tenant-scoped member directory with current account suspension and professional-accreditation visibility.
- Ordinary-role proposals, independent co-administrator decisions, reason capture, and immutable audit-event attribution.
- Suspending/restoring non-admin accounts with immediate session revocation and pending-proposal cancellation.
- Defensive login, account lookup, refresh-session and pending MFA-challenge handling for suspended accounts.
- Additional transaction-scoped suspended-member checks for protected writes, case progression and review operations.
- Database migration `010_member_management.sql`: suspension metadata, tenant-safe composite foreign keys, indexed pending role proposals, auditable decisions.
- `verify:v29` offline suite, CI steps, and a rollback-only disposable PostgreSQL test.

### Known limitations
- Permission catalogue represents currently hard-coded roles; arbitrary permission editing is not implemented.
- `ORG_ADMIN` authority still requires dedicated privileged onboarding and mandatory MFA.
- Full build and live database/browser tests remain unverified because dependencies, a valid lockfile and PostgreSQL were unavailable.

Release decision: **BLOCKED — NOT PRODUCTION READY**.
