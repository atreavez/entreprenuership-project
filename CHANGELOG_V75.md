# v0.75 — Current active-role authorization for core asset and case journeys

- Asset and case lists now decide organization-wide visibility from a current active membership row in tenant-scoped SQL.
- Asset detail and case detail retrieval now use transaction-scoped `requireCurrentAssetRead`/`requireCurrentCaseRead` guards and row locks, protecting access between permission check and data read.
- Asset creation rechecks an allowed current role under `FOR SHARE` in the same transaction as the asset INSERT and audit record.
- Confidential case-evidence listing now locks current case participation and reads evidence in a single transaction; duplicate tenant scoping was removed.
- Added 24 automated milestone tests, 35-suite regression matrix and CI wiring; preserved all 27 SQL migrations.
- Production remains blocked by missing authentic dependencies and absent live integration evidence.
