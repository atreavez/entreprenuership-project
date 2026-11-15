# AssetTrust v0.32 — Published Content Integrations

**Compiled by Aturinzire Hargreave**  
**Status:** development checkpoint; not production approved.

## Purpose

Connect **approved** content-management revisions to three existing application experiences without allowing a preview, a pending proposal, or a private organization template to become an active public message.

### In service

1. **Evidence-report drafts.** The existing authenticated `GET /api/v1/reports/case/:id` endpoint still checks case access and returns the previous report JSON. It now also returns `publication`, including the rendered organization-approved `report.summary`, source (`APPROVED` or `DEFAULT`), exact revision, `DRAFT` status, and a policy-owned non-official legal notice. The React Evidence Reports page displays this wording and retains the original evidence and disclaimer. This is a dynamically rendered report draft—not an issued PDF, a signed report, or a legal certificate.
2. **In-app case assignment.** A successful case reassignment uses the transaction to look up the current case code, active organization recipient and organization name. It uses the approved `notification.case_assigned` body, then records the notification **in the same transaction** as the assignment and audit entry. The completed in-app notification retains the text that was used at the time of assignment. It does not send an external email or SMS. A malformed published template causes the transaction to fail closed.
3. **Public website content.** `GET /api/v1/public-content/:key` exposes **only** `website.hero_title` and `website.support_notice`. It reads published platform-scope template values, never pending proposals or tenant-specific content. The unauthenticated React sign-in view loads these two values and falls back to the static copy if unavailable. Plain React text rendering prevents approved copy from being treated as executable HTML. The fixed legal notice remains outside admin-controlled copy.

### Admin publishing lifecycle

1. An admin proposes a change in **Content & Templates**.
2. Sensitive revisions remain `PENDING` until approved by an independent current administrator with fresh MFA, under existing v0.31 rules.
3. Only `admin_content_templates` (the published table) is read for live use; `admin_content_proposals` is never part of a publishing query.
4. Reports and in-app notifications include the published copy that is current **when they are generated**; a subsequent published change affects future drafts/events, not previously stored notifications.
5. If no published organization template exists, the code uses a tested catalogue default with `revision: 0`. Invalid/corrupt published content is rejected, not silently substituted.

### Security contracts

- No arbitrary template keys, scripting, HTML/XML or uncontrolled variable names.
- Separate `platform` vs `organization` scopes, with tenant ID supplied by authentication, never by a caller's arbitrary query parameter.
- Public endpoint uses a hard-coded allowlist and platform sentinel ID.
- Current case participation must pass existing authorization; cross-tenant report rows are restricted by `organization_id`.
- The current case assignment process enforces transaction-time assignee eligibility and uses organization-scoped recipient queries.
- No private case IDs or organization content are embedded in public landing responses.
- Non-official title notice cannot be edited through the template catalogue.
- Future email/SMS delivery uses an explicit external-delivery port with a deny-by-default adapter. The adapter currently returns `NOT_CONFIGURED` and never claims successful delivery.

### Still out of scope

- Provider-backed SMS/email delivery, reliable outbox/retry, bounce handling, consent and provider configuration
- Digitally signed PDF evidence reports, report issuance, permanent report snapshots or QR-based verification
- Public website publishing beyond the two approved textual elements
- Real government title registry integration, official legal attestation or blockchain anchoring

### Database migrations

No new migration is required in v0.32. The code uses the existing `012_content_templates.sql` approved-content tables and existing notifications/case tables. Previously committed migration SHA-256 digests remain unchanged. Existing installations must have all v0.31 migrations applied before running this application version.

### Test boundaries

Offline tests execute the pure publishing policy, the real content service, the existing report service, and case assignment under controlled database substitutes. A separate PostgreSQL test is supplied and wired into CI, but it has **not** been run in this environment. Source-derived desktop/mobile screenshots are not live React end-to-end testing. `npm ci`, full NestJS/React build and production deployment remain blocked here.
