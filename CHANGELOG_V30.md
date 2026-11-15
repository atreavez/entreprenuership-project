# AssetTrust v0.30 — Workflow & Approval-Rule Administration

Compiled by Aturinzire Hargreave.

## New deliverables
- New DDD bounded context `contexts/workflow-admin` with a framework-free deterministic workflow policy, NestJS controller/service, and PostgreSQL migration `011_workflow_admin.sql`.
- Organization-scoped, optimistic-concurrency-controlled workflow stage policies with an append-only proposal and decision history. Two currently active organization administrators must independently propose and decide each change; both write operations require recent MFA step-up.
- Configuration allows target duration, reminder lead time and one **additional** independently accepted evidence type for each of six open verification stages. Mandatory stage order, the base required evidence type, professional accreditation, independent review, unresolved-dispute blocks, official-status disclaimers and final approval rules are never configurable.
- The **real** case-readiness and advancement use cases now apply approved stage policies; unapproved proposals do not affect cases. Decisions and case-stage audit metadata include the effective workflow policy version.
- New React **Workflow Designer** page linked in the administrator navigation, source-rendered desktop and mobile previews, and honest preview-mode behavior.
- Disposable rollback-only PostgreSQL test, v0.30 Node policy/service/integration tests and GitHub Actions checks.
- Migration manifest updated to require migration `011` plus both workflow tables. Historical migration checksums retained unchanged.
- The legacy `workflow.review_target_days` organization setting remains metadata only and is explicitly labeled as such; it does not silently override the new workflow engine.

## Release decision
**NOT PRODUCTION-READY.** Offline verification is green, but authentic npm lockfile, successful full NestJS/React build, live PostgreSQL integration and browser end-to-end tests remain outstanding.
