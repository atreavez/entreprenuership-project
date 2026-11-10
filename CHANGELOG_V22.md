# AssetTrust v0.22 — Professional Trust Session-Expiry Hardening

## Changes
- Fixed three professional-trust authorization paths that previously checked active MFA and revocation, but did not recheck the access-session expiry timestamp in SQL:
  1. `PgTrustRepository.transaction().getActor` before casting an independent professional attestation.
  2. `ProfessionalTrustService.staff` before showing the cross-organization reviewer queue or proceeding to a reviewer action.
  3. `ProfessionalTrustService.revoke` during the **transaction** that revokes a professional accreditation.
- Added explicit `s.expires_at > now()` conditions. The transactional actor check preserves `FOR SHARE OF u,pr,m,s`; the revocation transaction preserves `FOR SHARE OF pr,m,s`.
- Added eight offline tests that execute the actual TypeScript repository/service against deterministic SQL substitutes. Five tests failed on v0.21 before the patch; 8/8 pass after.
- Added `test:pg:trust-session:v22`: extracts the actual three authorization SQL statements and checks seven states in a disposable local PostgreSQL transaction, rolling all fixtures back.
- Registered new verification commands and the PostgreSQL check in GitHub Actions; incremented workspace versions to 0.22.0.
- No schema migration or UI changes are necessary for this correction.

## Release decision: BLOCKED
- No local `node_modules`, no authentic `package-lock.json`.
- `npm run build` fails due to missing third-party and Node type packages; it was attempted and the error log is provided.
- No live PostgreSQL/PostGIS or browser validation occurred here.
- Do **not** deploy to production until a reproducible installation, complete build and live tests succeed.

AssetTrust internal professional accreditation is not government endorsement; private asset records and evidence reports are not legal proof of title.
