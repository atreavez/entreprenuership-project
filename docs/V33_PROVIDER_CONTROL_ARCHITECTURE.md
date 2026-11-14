# AssetTrust v0.33 — Administration of Notification Provider Routes

**Status:** Offline-tested development checkpoint. External SMS and email transports remain intentionally disabled. This release is **not production-ready**.

## Why the module exists

The Admin Control Plane must let organization administrators prepare notification provider choices without editing the application source code, while preventing a rushed configuration from leaking credentials or silently sending messages. v0.33 adds the *staging* and *approval* layers. It does **not** activate SMTP or HTTPS transports.

## User capabilities

A current organization administrator can view the organization-scoped Email and SMS routes, inspect the latest 100 proposals, propose a route change, and approve or reject another administrator's proposal. A new route can be either `DISABLED` or `STAGED`. Staging records a proposed provider class (`SMTP_RELAY` or `HTTPS_RELAY`) and a **nonsecret reference** such as `vault://assettrust/email-primary`.

A route in `STAGED` state has `deliveryState=NOT_CONNECTED` regardless of whether an administrator approved it. Delivery of external messages must stay disabled until a separately implemented and tested transport adapter, secret store integration, sender verification, opt-in/consent checks, throttling, retry policy, delivery receipts, alerting, and operational monitoring exist. The v0.32 `DisabledExternalNotificationAdapter` remains the default.

## Security model

- **DDD:** `contexts/provider-admin/domain/provider-policy.ts` is independent of NestJS/PostgreSQL/React. It owns the known channel/provider combinations, strict allowlist, revision validation, and non-delivery result.
- **Application boundary:** `ProviderAdminService` performs use cases inside `Database.transaction()` with row locks and an advisory lock per organization and channel. A new proposal does not change the published route.
- **Identity:** All writes invoke `assertCurrentAdminStepUp()` to check a current `ORG_ADMIN` role, non-suspended account, unrevoked/unexpired session, enabled MFA and fresh MFA verification.
- **Separation of duties:** The proposing administrator cannot approve their own change. The original administrator's current role and organization membership are rechecked at approval time.
- **Tenant isolation:** Every proposal and route query is scoped to the caller's `organization_id`. SQL composite foreign keys prohibit cross-organization administrator references.
- **Versioning:** An optimistic expected version is validated under transaction locks, and PostgreSQL enforces at most one pending proposal per organization/channel.
- **Audit:** Proposed, approved, and rejected events use the existing audit service. Proposals remain in the database as a decision timeline; they are not silently overwritten.
- **Secret isolation:** The API rejects password/key fields, arbitrary URLs and unknown configuration fields. SQL stores only a syntactically validated `vault://namespace/alias` **reference**, not credentials. This reference is not resolved or contacted by v0.33.
- **Fail closed:** `LIVE`, `enabled=true`, arbitrary provider URLs and external delivery claims are not permitted. The code never makes an outbound delivery call.

## API endpoints

All require a current authenticated session; the service checks an active organization-admin identity again inside the database transaction.

| Method | Endpoint under `/api/v1` | Meaning |
|---|---|---|
| GET | `/admin-providers/routes` | Two organization-scoped Email/SMS route records, including fail-closed delivery status |
| GET | `/admin-providers/changes` | Organization-scoped pending/decided proposals, latest 100 |
| POST | `/admin-providers/changes` | Propose a staged or disabled route (recent MFA required) |
| POST | `/admin-providers/changes/:id/decision` | Approve/reject a different administrator's pending proposal (recent MFA required) |

Sample request body:

```json
{
  "channel": "EMAIL",
  "provider": "SMTP_RELAY",
  "status": "STAGED",
  "senderLabel": "AssetTrust Uganda",
  "credentialRef": "vault://assettrust/email-primary",
  "expectedVersion": 0,
  "reason": "Prepare the organization's email relay for review"
}
```

The response describes a **pending proposal**, not a sent message.

## Migration

`apps/api/sql/013_notification_provider_staging.sql` appends two tables, the immutable-proposal history, constraints and indexes. Migration `001`–`012` bytes are unchanged. The checksum is registered in `schema-manifest.ts`, along with two required tables.

**Existing installations:** back up the database, verify v0.11+ ledger state and the upgrade instructions, and apply only reviewed migrations. Do not run baseline-mode or fresh-install commands against existing data without backup and schema review.

## What is intentionally not delivered

Real SMTP configuration, HTTP API delivery, provider secrets, message queues, rate limits and per-user marketing consent, suppression lists, sender identity verification, delivery receipts, retry/dead-letter handling, message-cost accounting and integration with external SMS aggregators remain for future milestones. The existing in-app case-assignment notification flow remains independent and is not replaced by this module. No signed report or official land-title certification is issued.

## Outstanding release gates

The authentic npm lockfile is absent. `npm ci` cannot run; the full NestJS/React build cannot resolve dependencies here; the disposable PostgreSQL test and browser/runtime e2e tests have not been run. The source-based screenshots are illustrative and not live browser/application integration results.
