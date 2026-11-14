# AssetTrust v0.46 - Tenant isolation architecture and threat model

## What is actually protected in this checkpoint

- `report_pdf_layout_proposals`
- `report_pdf_layout_revisions`
- `report_pdf_layout_active`

These are **private PDF-layout administration** tables; this is a bounded rollout, NOT database-wide tenant isolation. Migration `021_pdf_layout_rls.sql` adds PostgreSQL row-level security with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; policies use `organization_id = NULLIF(current_setting('assettrust.tenant_id', true),'')::uuid` in both `USING` and `WITH CHECK`. A missing transaction-local tenant context returns zero rows and rejects writes. The existing organization foreign keys, independent approval workflow, immutable approved revision trigger and audit trail remain intact.

## Trusted context path

- Authenticated organization-admin endpoint -> validate current admin + fresh MFA step-up -> set validated UUID context with `set_config(...,$1,true)` inside `Database.transaction()` -> read/write private layout rows.
- Recipient redemption -> verify share ID + both bearer secrets + access policy -> obtain organization from the locked share record -> set transaction-local context -> render PDF from approved layout. The recipient cannot provide or select the tenant context.
- Unauthenticated public QR verification does not use these protected layout tables and remains separate from sensitive downloads.

The context is a **custom PostgreSQL GUC**, not a cryptographic proof of user identity. SQL injection that can execute arbitrary SQL could change this variable. Defense in depth requires server-side authorization, parameterized queries, a distinct non-privileged runtime DB role, restricted DB network access, and audited controls. Organization authorization still belongs in the domain/application layers.

## Production runtime database role

The NestJS database provider rejects production startup when current PostgreSQL role is a superuser, BYPASSRLS, CREATEROLE, CREATEDB, or the owner of any protected layout table. It also refuses missing or non-FORCE RLS. This check requires a separately provisioned runtime role. Schema migrations must run with a different, restricted migration owner. A shared migration/runtime superuser must never be used in production. Do not grant the runtime role ALTER TABLE or broad DDL privileges. Do not grant it membership in privileged roles.

## Test strategy

The offline suite exercises identifier validation, parameterized and transaction-local context, precise policy scope, covered code paths, dynamic startup fail-closed behavior, append-only migration manifest and CI coverage. The live PostgreSQL script is guarded by `tools/pg-e2e-policy-v21.cjs`: loopback-only, disposable `*_ci` or `*_test`, `NODE_ENV=test`, explicit `ASSETTRUST_E2E_ALLOW_MUTATION=YES`; it creates synthetic tenants, applies a temporary NOLOGIN NOBYPASSRLS role, checks visibility for two tenants and cross-tenant INSERT rejection, then rolls back every fixture and the role. It has NOT run in this environment.

## Limitations and follow-up

Full RLS across assets, cases, documents, private evidence, audit trails, user identity, billing, and remaining admin modules must be designed as a separate, route-by-route migration. Some reports intentionally expose **minimal public verification metadata**, so indiscriminately enabling RLS on every table would break valid public workflows or lead to unsafe bypasses. Independent cross-tenant HTTP tests, production database privileges, rollback plans, connection-pool transaction bleed tests and security review are mandatory before release.
