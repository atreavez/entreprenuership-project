# AssetTrust v0.31 — Content & Template Administration

**Compiled by Aturinzire Hargreave**

- Added bounded content-template domain policy, with eight approved keys across organization/platform scopes.
- Added `012_content_templates.sql`, applied revisions and pending/rejected/approved proposal history. All historical migration fingerprints remain unchanged.
- Added tenant-scoped and platform-appointed NestJS controllers and transaction-based approval service with current MFA/role revalidation, version checks, row locks and audit events.
- Added source-backed React **Content & Templates** administration page, responsive previews, report wording, upload guidance, notification text drafts, template variable hints and approval queue.
- Added 29 policy/service/schema tests, a gated rollback-only PostgreSQL SQL contract test, and CI verification steps.
- Updated migration readiness manifest, root/app versions, navigation, static preview renderer and installation guides.
- No live email delivery, public website publishing, document PDF generation, or signed report system is implied.
- Production blocked pending authentic npm lockfile, full build, live DB and browser integration evidence.
