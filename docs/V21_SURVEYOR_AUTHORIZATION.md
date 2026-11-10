# AssetTrust v0.21 — Current Professional Authorization

**Compiled by Aturinzire Hargreave**  
**Development checkpoint only — NOT production approved**

## What went wrong

A surveyor's `professionalApproved` property was calculated during request authentication by `AuthenticationService.lookup()` and then passed into `PgParcelRepository.review()`. The v0.20 repository transaction rechecked the session/MFA state but **did not check the professional accreditation row at the moment of review**. An accreditation could have expired or been revoked after a request was authenticated, or a role/organization could have changed. A stale `professionalApproved:true` should not allow new evidence to be reviewed.

## Fix and transaction semantics

`apps/api/src/contexts/geospatial/infrastructure/pg-parcel.repository.ts` retains a fast precondition on actor role and accreditation, but its transaction now re-authorizes all of the following in PostgreSQL:

- The session belongs to the acting user, has not expired, and has not been revoked.
- The MFA credential is currently enabled and the session has MFA step-up within the last 15 minutes.
- The **current** user row is assigned to the same organization and still has `SURVEYOR` role.
- `professional_accreditations` matches that current role, has not been revoked, and is not expired.
- The check uses `FOR SHARE OF s,m,u,p` inside the transaction; concurrent revocation/role/MFA changes must serialize with a review.
- The asset is still in the acting organization and the claim is submitted and authored by a different person. Existing independent-review and audit policy remains unchanged.

Only one guarded SQL SELECT is needed for this critical credential check. This is an **authorization verification**, not a professional licence registry integration, legal determination, title search, or cadastral guarantee.

## Test coverage

`npm run verify:v21` executes 16 offline tests:

1. A revoked or expired accreditation blocks a review even when the actor carries a previously approved flag.
2. A changed role or organization blocks a stale actor.
3. Valid, independently submitted reviews can proceed.
4. Disabled MFA still blocks the review.
5. The authorization SQL contains role, organization, validity and row-lock checks.
6. The new live-Postgres test environment policy denies remote hosts, non-test environments, and non-disposable database names.
7. The API TypeScript configuration must not emit JavaScript on any compilation error, and build outputs must remain outside tracked source.

The first 8 repository assertions were written before the fix: five failed against v0.20 and all eight passed after the fix. Tests execute actual transpiled repository TypeScript with a controlled query adapter; they are not a substitute for PostgreSQL.

## Real PostgreSQL assertion script (NOT executed in this checkpoint)

`tools/e2e-pg-review-v21.mjs` extracts the review authorization SQL from the real TypeScript source and executes it against a migrated disposable PostgreSQL database. It inserts a synthetic professional application, accreditation, session and MFA credential inside `BEGIN`, tests current/expired/revoked/changed-state authorizations, then rolls back unconditionally. It does NOT simulate a legally certified surveyor, nor does it complete a full signed verification case. It must be run only with `NODE_ENV=test`, explicit mutation authorization, a localhost PostgreSQL address and a database name ending `_test` or `_ci`. See `docs/V21_KALI_RUNBOOK.md`.

**Caution:** CI will not reach that step until the separately required authentic dependency lockfile, installation and full compilation succeed. The v0.21 code and simulated tests do not imply production readiness.
