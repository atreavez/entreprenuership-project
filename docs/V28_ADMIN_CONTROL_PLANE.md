# AssetTrust v0.28 — Admin Control Plane Architecture

**Author credit:** Compiled by Aturinzire Hargreave.

## Purpose

The goal is to make the platform operable from its administration interfaces without source-code changes for routine supported settings. This checkpoint is **the foundation**, not a blanket claim that all business features are configurable. Its controls are intentionally allowlisted, individually validated, tenant-scoped, versioned and audited.

### Administrator boundaries

1. **Organization Admin (ORG_ADMIN)** manages settings for their current organization only. The backend reloads their current organization role and session state from PostgreSQL; it never trusts old JWT role claims for a protected setting. All writes require enabled authenticator MFA and a step-up verified within the preceding five minutes.
2. **Platform Administrator** is a separately appointed existing ORG_ADMIN user. Their current appointment is checked from `platform_admin_appointments` on every global settings request. Platform administrators may edit *platform-wide* registered setting keys and list limited organization directory metadata. This does not grant access to other organizations' evidence, private documents or asset records.
3. **Bootstrap** of the **first** platform administrator is a privileged infrastructure-operator action, *not* a public HTTP endpoint. It requires an existing ORG_ADMIN whose MFA is already enabled, an explicit reviewed email and two intentional environment confirmations. It writes an audit-linked `PLATFORM_ADMIN_BOOTSTRAPPED` event. Later global-appointment delegation is not implemented in v0.28; neither self-service escalation nor repeated initial bootstrapping is supported.

### Database schema

Append-only migration `009_admin_control_plane.sql` creates:

- `platform_admin_appointments`: separately recorded appointments; `revoked_at` state.
- `admin_configuration_values`: one current applied JSON scalar per `(scope,scope_id,key)` with integer optimistic version.
- `admin_configuration_changes`: immutable proposed value, submitter, expected version and final decision metadata. One pending proposal per key is enforced by a filtered unique index.

The platform scope uses a fixed UUID sentinel; organization scope always uses the authenticated user's current organization ID from the server-side role check. The existing `audit_events` hash-chain receives proposal/approval/rejection/applied events. Do **not** edit old migrations or their hashes.

### Configuration domain and runtime integration

`contexts/admin-control/domain/configuration-policy.ts` is framework-independent. Supported keys are explicitly defined with scope, type, validation, impact and application stage. Unknown keys, raw SQL, arbitrary JSON, direct changes to permissions or security invariants are all rejected.

- **Currently displayed/configured in administration:** workspace display name, workspace support email, workspace announcement, platform product name, support email and notice.
- **Partially connected runtime setting:** workspace display name is also shown in the running application's top bar when the authenticated ORG_ADMIN reloads the workspace configuration.
- **Stored metadata / not yet operational:** billing default currency, primary operating country, evidence report footer note, workflow target duration, notification sender label. The configuration storage does **not** activate payments, send notifications, rewrite report templates, change mandatory evidence stages or connect to government registries.

### Change-control transaction

1. Parse scope, key and typed value through the domain allowlist; reject unexpected input and invalid versions.
2. Start a database transaction, verify current admin role, current active session, current enabled MFA and recent step-up. Platform scope additionally checks current global appointment under lock.
3. Take the key's transaction-scoped advisory lock **before** examining pending changes or applied version. Enforce optimistic `expectedVersion`, reject concurrent/stale updates.
4. For an ordinary edit, write the change record and update the applied configuration in the **same transaction**, and append a tenant-scoped audit event.
5. For a high-impact edit, insert **only** a pending proposal and a corresponding audit event; the effective value remains unchanged.
6. A **different**, currently authorized administrator must perform a fresh MFA step-up and approve or reject. Recheck original submitter's authority, change status, current version and typed allowlist before applying. Lock order is consistent with proposal creation to avoid deadlocks.
7. Approvals and rejections are audited. No config delete/edit-history endpoint is exposed. The configured value can be changed again only by another versioned proposal.

### Non-negotiable immutable protection

- Official land registry entries are **not** reproduced or asserted as authoritative in AssetTrust.
- An evidence hash, approved case, plotted boundary, reviewer signature or private report is **not** legal proof of ownership.
- Audit history, original evidence, external blockchain anchors, signed reports, legally required notices and security-critical rules cannot be silently rewritten. Authorized corrections must be new traced records or superseding revisions.
- MFA, independent final review, accreditation, tenant isolation and authorization policies remain code-enforced safeguards, not administrator-controlled toggles.

## Current API routes

All under `/api/v1/admin-control`, and all behind the existing `AuthGuard`:

| Route | Scope / behavior |
|---|---|
| `GET /me` | Current org-admin status and independent platform appointment |
| `GET /catalog?scope=organization\|platform` | Allowlisted keys and validation metadata |
| `GET /settings?scope=...` | Current **applied** values and versions, excluding pending proposals |
| `GET /changes?scope=...` | Most recent 100 scoped proposals and decisions |
| `GET /organizations` | Global appointments only; limited organization name/ID/date metadata |
| `POST /changes` | Requires recent MFA; validates `{scope,key,value,expectedVersion}` |
| `POST /changes/:id/decision` | Requires **different** current administrator plus MFA and `{decision:'APPROVE'\|'REJECT'}` |

All authorization is enforced on the backend; hiding controls in React is supplementary only.

## Roadmap for genuinely comprehensive administration

| Area | v0.28 | Next engineering work |
|---|---|---|
| Configuration core, change approvals and history | Implemented and offline-tested | Live DB/API verification and operational observability |
| Tenant organizations | Limited global directory | Status, lifecycle, onboarding and delegated sub-admin controls |
| Users and roles | Existing role and co-admin features remain | Audited granular RBAC/ABAC registry and reviewable permission changes |
| Workflows | Advisory target metadata | Versioned stage designer with validation, simulation and immutable minimum safeguards |
| Website, localization and templates | Limited branding/announcements | Versioned content editor, languages, template preview/publish |
| Payments, plans and tax | Currency metadata only | Billing domain, entitlements, payment provider adapters and reconciliation |
| Providers and integrations | Existing adapters retained | Secrets vault, test connections, provider switching with least privilege |
| Forms, asset categories and report layouts | Not yet editable | Validated schema/field registry and version-aware data migrations |
| Monitoring, backup, jobs and infrastructure | Existing readiness features retained | Admin operations center with guarded operational actions |
| Government registries, public records and notarization | Not available | Authorized providers, verifiable provenance and explicit legal boundaries |

**Release gate:** Real `npm ci`, TypeScript/NestJS/React build, migrations and PostgreSQL integration, authenticated HTTP flow, and browser end-to-end tests must pass before production deployment. Offline tests are not enough.
