# AssetTrust v0.29 — Member, Role & Permission Governance

**Compiled by Aturinzire Hargreave**  
**Engineering:** DDD · TDD · SOLID · Clean Architecture · Security-by-Design.

## Purpose
This is the first operational **Member Management Center** built on v0.28's scoped Admin Control Plane. Changes use authenticated API calls and persistent PostgreSQL records; the preview is **not** a live deployment. There is no generic user-supplied permission-evaluation engine: the roles catalogue describes the application's currently code-enforced roles and the permissions editor remains a future project.

## Authorized API contract
All paths below are prefixed with `/api/v1`; every call requires an authenticated, current `ORG_ADMIN` session in the caller's **own organization**:

| Method / path | Operation | Extra controls |
|---|---|---|
| GET `/admin-members/catalog` | Read role summaries | Current administrator and session |
| GET `/admin-members/members` | Read member directory, maximum 200 | Tenant filtering and no password/MFA material |
| GET `/admin-members/role-changes` | Read 100 most recent proposals | Tenant filtering |
| POST `/admin-members/members/:id/role-changes` | Propose role adjustment | Recent MFA, target row lock, reason, non-admin role, pending uniqueness |
| POST `/admin-members/role-changes/:id/decision` | Independently approve/reject | Different current administrator, fresh MFA, role revalidation and DB locks |
| POST `/admin-members/members/:id/status` | Suspend or restore non-admin account | Recent MFA, reason, tenant scope, no self-suspension |

`role-changes` body: `{ "role": "REVIEWER", "reason": "A specific justification of at least twelve characters" }`. `decision` body: `{ "decision": "APPROVE" }` or `REJECT`. `status` body: `{ "action": "SUSPEND" | "RESTORE", "reason": "..." }`.

### Permission boundaries
- The new ordinary-role editor never grants or removes `ORG_ADMIN`. Administrative invitations and lifecycle must use the separately MFA-protected co-admin process from v0.27.
- Ordinary roles: `CLIENT`, `REVIEWER`, `SURVEYOR`, `LEGAL_REVIEWER`. A specialist **candidate** does **not** become accredited simply by changing roles. An approved role transition revokes any previous live professional accreditation and sets the legacy `professional_approved` flag to false; fresh independent vetting is required.
- A role proposal is not effective until **another** active administrator approves it. Both proposing and approving administrators are checked against current DB roles. Rejection leaves the user's role unchanged. Stale proposals fail closed.
- A suspension is immediate and audited. It revokes every active refresh session, blocks subsequent login, account lookup and pending MFA completion, and cancels pending role proposals. Restore is separately audited and never revives sessions.
- An approved role change revokes all sessions and clears the user's open-case assignments so a formerly qualified reviewer does not retain a now-inappropriate assignment. Organization operations staff must reassign those cases.
- The authenticated APIs and most sensitive transaction-scoped authorizers now check `users.suspended_at IS NULL`, complementing session revocation; nevertheless, live concurrency tests are a release prerequisite.
- Audit changes use the existing hash-chained organization event writer. Proposals have separate, indexed decision history. Do not silently rewrite audit history, official title records, or previously submitted evidence.
- Cross-tenant proposal references are constrained at both the application and database level with `(user_id, organization_id)` foreign keys.

### Clean Architecture
- **Domain**: `apps/api/src/contexts/member-management/domain/member-policy.ts` (pure role, reason and lifecycle decisions; no NestJS/React/PG imports).
- **Infrastructure**: `apps/api/src/contexts/member-management/infrastructure/member-management.module.ts` (NestJS API, database transaction/lock, role application and audit adapters).
- **Schema**: `apps/api/sql/010_member_management.sql`; previous migrations remain untouched and checksummed; `schema-manifest.ts` includes this new hash.
- **Presentation**: `apps/web/src/MemberManagementPage.tsx`, reachable from sidebar `Members & Permissions` and the Admin Control Plane; responsive styles in `styles.css`. Demo previews show fictional people and have disabled mutations.

## Operational safety and limitations
1. **Not yet production ready:** no authentic `package-lock.json`, npm dependencies unavailable in the authoring container, full NestJS/React build not verified, and live PostgreSQL/browser tests have not been run.
2. Dynamic per-user permissions, custom roles, platform-wide member management, membership transfers across organizations, approval-policy editing, and automatic reassignment are **not** implemented.
3. This administration module cannot bypass government registry requirements or change legal land ownership. It does not expose private document contents to global platform administrators.
4. The UI intentionally shows a two-administrator workflow. A tenant needs two genuinely independent, authenticated administrators with MFA before approving ordinary role changes.
5. No real accounts, passwords, identities, or production database records are bundled in this checkpoint. Screenshot accounts are fictional.
6. Existing databases must be backed up and use the versioned migrator; never reset or edit their migration ledger manually.
