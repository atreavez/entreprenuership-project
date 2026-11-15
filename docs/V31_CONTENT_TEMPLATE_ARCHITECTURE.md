# AssetTrust v0.31 — Content & Template Administration Architecture

**Compiled by Aturinzire Hargreave**

## Purpose and boundaries

This checkpoint implements a first-class, database-backed configuration bounded context for approved **plain-text** templates. Its scope is limited to report wording drafts, reviewer notes, upload guidance drafts, notification message drafts, workspace tagline, and two platform-level website text drafts. It is **not** a document editor, a CMS with live website publishing, an operational SMS/email sender, or a signed/certified land-title report generator.

The five required engineering disciplines are preserved: **DDD, TDD, SOLID, Clean Architecture and Security by Design**. Domain policy (`apps/api/src/contexts/content-admin/domain/template-policy.ts`) does not import NestJS, SQL, or React. The NestJS adapter and PostgreSQL transaction logic live in `infrastructure/content-admin.module.ts`. React UI lives in `apps/web/src/ContentAdminPage.tsx`.

## Editable template catalogue

| Scope | Template key | Class | Publication policy |
| --- | --- | --- | --- |
| Platform | `website.hero_title` | Website headline draft | Independent approval |
| Platform | `website.support_notice` | Website support draft | Independent approval |
| Organization | `branding.workspace_tagline` | Non-legal tagline | Audited immediate publication |
| Organization | `report.summary` | Report summary draft | Independent approval |
| Organization | `report.reviewer_note` | Reviewer note draft | Independent approval |
| Organization | `document.upload_guidance` | Upload guidance draft | Independent approval |
| Organization | `notification.case_assigned` | Assignment notification draft | Independent approval |
| Organization | `notification.case_updated` | Update notification draft | Independent approval |

**Publishing** means publishing a new active revision inside the template store. It does not mean sending a notification, publishing a website, or generating a signed report.

Each key has an explicit allowlist of substitution variables (e.g. `{{asset_reference}}`, `{{case_reference}}`). The server rejects arbitrary keys, HTML/XML angle brackets, control characters, invalid token syntax, unauthorized placeholders, unsupported request fields, and oversized bodies. Plain text is rendered as React text; no raw HTML execution or templating expressions are allowed.

The legal non-ownership notice is a **code-defined constant**, not an editable template body. For report previews the API returns the notice separately and unconditionally. Existing signed evidence, audit records, government data, MFA policies, and mandatory workflow requirements are not modified by templates.

## HTTP administration API

All routes are under `/api/v1/admin-content`, require active authenticated sessions and a current organization administrator role, and are isolated by organization scope. Platform-scoped content additionally requires an active appointment in `platform_admin_appointments`.

- `GET /templates?scope=organization|platform` — approved current revisions or catalog defaults.
- `GET /changes?scope=organization|platform` — latest 100 proposals and decisions for the authorized scope.
- `POST /preview` — safely expand supplied test values for a draft, returning `watermark`, `text`, `notice` and `sent:false`; **does not persist or deliver** anything.
- `POST /changes` — propose a validated update with key, body, scope, expected revision and reason. Sensitive changes remain `PENDING`.
- `POST /changes/:id/decision` — independent `APPROVE` or `REJECT`; requires fresh MFA. Approvals revalidate the exact current domain allowlist and expected version.

Writes validate the **current database session, MFA credential, user role and suspension state** inside the transaction. Platform writes recheck live appointment status. Two administrators cannot approve their own sensitive proposal. Revisions use advisory locks, `FOR UPDATE`, optimistic version checks, and a unique partial index blocking duplicate pending proposals. Applied changes and decisions are recorded using the existing audit service.

## Database migration

`apps/api/sql/012_content_templates.sql` appends two tables: `admin_content_templates` (current applied versions) and `admin_content_proposals` (change and review history). Organization proposals enforce matching organization IDs for submitter and reviewer, including composite foreign keys to the existing `users(id,organization_id)` key. Platform scope uses the fixed global scope UUID. An explicit narrowly scoped SQL exception permits same-user publication for **only** `branding.workspace_tagline`; all other templates require independent approval.

`schema-manifest.ts` now includes migration 012 and both tables in startup readiness. Migrations 001–011 are unchanged: do not edit historical fingerprints or rerun older SQL against an already versioned database.

## Gaps and future modules

1. Map template versions into actual report-generation jobs and freeze the template revision used by each issued report. Add cryptographic signing, QR verification, and legally vetted fixed disclosures **later**.
2. Connect notification drafts to a provider-neutral notification adapter with queueing, retries, consent/preferences, deliverability monitoring, and audit evidence. This module currently **sends nothing**.
3. Connect global website text drafts to a reviewed publisher/preview/release workflow. These are not currently visible on the public homepage.
4. Add richer document type and requirement management, storage-retention rules, translation/localization, named template variants, and asset-type-specific templates. These must remain separate from immutable evidence history.
5. Run a real NestJS/React build, migrate disposable PostgreSQL/PostGIS, execute the SQL contract and HTTP/browser E2E tests. Offline checks do not prove deployed behavior.

## Release verdict

**NOT PRODUCTION-READY**. The npm lockfile is absent, full dependencies are unavailable in this workspace, and neither live PostgreSQL integration nor complete browser tests were executed.
