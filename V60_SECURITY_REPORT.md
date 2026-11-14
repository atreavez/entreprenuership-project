# AssetTrust v0.60 - Security Assessment

**Date:** 11 November 2026  
**Verdict:** NO-GO for commercial deployment and real customer records.

## Finding: excessive rights granted to test API role

In v0.59, the CI runtime login received `SELECT, INSERT, UPDATE, DELETE` on all existing application tables, including the schema-migration ledger and the append-only audit log. The seven existing PostgreSQL RLS-protected tables provided scoped row access, but no row-level grant rule prevented that account from rewriting internal migration or audit records. Broad grants on other unprotected tables remain a concern and require separate remediation.

## Remediation delivered in source

- The new role-provisioning workflow revokes migration-ledger writes and audit history updates/deletes, while preserving migration-status reads and audit append operations.
- A guarded, read-only PostgreSQL check validates effective permissions through `has_table_privilege`, role flags, database/schema CREATE privileges and role membership.
- A separately authorized repair command can narrow grants on a pre-existing **disposable test** role without recreating it.
- Both GitHub Actions and the supervised Kali database plan place privilege verification before seeded tenant data or API integration checks.

## Evidence and limitations

The 15 new tests and 58 version suites pass. CI workflow parsing, static source validation and previous migration checks pass. The project has no authentic npm lockfile here, and `npm run build` fails on missing Node type definitions/dependencies. PostgreSQL is unavailable for live effective-grant checks, RLS CRUD and integration tests. The malware scanner, original Git history and deployed HTTPS environment were not validated.

**Remaining material risks:** role access to other unprotected tables and user/account data; absence of live operational evidence; production role credentials/permissions still unknown; untested deployment; unreconciled package supply chain. Altering CI grants is not proof of production safety or land-title authenticity.

## Required next acceptance criteria

1. Real `npm ci` from a reviewed lockfile, clean builds, tests and vulnerability assessment.
2. Live disposable PostgreSQL privilege audit with the restricted role, followed by seeded multi-organization positive/negative RLS tests.
3. Complete sensitive-table inventory and production-app role grant/RLS remediation beyond the seven protected tables.
4. Real ClamAV, authenticated browser, two-API, infrastructure and Git-history security evidence.
5. Backup/restore rehearsal, independent release review, approved deployment procedures and explicit stakeholder sign-off.

Until all these gates are met, **NO-GO** remains mandatory.
