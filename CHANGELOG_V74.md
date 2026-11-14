# AssetTrust v0.74 — Current-role authorization

- Document listing now uses the current active database member and role, instead of relying on a potentially stale JWT ORG_ADMIN claim.
- Grant listing, creation and revocation now require an active ORG_ADMIN membership inside the operation's tenant-scoped transaction; current membership is locked with FOR SHARE.
- Grant writes validate target asset and current active grantee in the same transaction as the audit entry.
- Added 19 direct security regression tests; retained prior v73 transactional document-read and encrypted-store design.
- All 27 existing SQL migrations and the approved RLS policy inventory remain unchanged.
- This checkpoint is **not** production certified; authentic dependencies, live PostgreSQL and browser/HTTP tests are outstanding.
