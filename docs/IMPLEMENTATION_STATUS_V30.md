# AssetTrust v0.30 implementation status

## Implemented and tested offline
Bounded workflow-admin context; tenant-scoped versioned stage policies; validation; current administrator session and recent MFA gates; two-person approval/rejection; SQL migration 011 with tenant FKs and pending uniqueness; audit events; effective stricter evidence gates applied to case readiness and advancement; React workflow administration page; responsive static previews; CI test additions.

## Partially integrated or not yet verified
`targetDays` and `reminderDays` are effective metadata in case readiness, **not automated notification jobs**. The new NestJS module and SQL migration are implemented but are not verified against a real service/database in this workspace. Frontend screenshots are source-derived, not live E2E evidence. Existing configuration key `workflow.review_target_days` remains legacy metadata and does not alter the new stage rules.

## Future work
Authentic npm lockfile; full API and web builds; migration tests on PostgreSQL/PostGIS; two-admin HTTP/browser workflow tests; staging/backup/restore and security review; notification scheduler; workflow activation planning for in-flight cases; pricing, integrations, document templates and granular administrative permissions.

**Release decision: NOT APPROVED FOR PRODUCTION.**
