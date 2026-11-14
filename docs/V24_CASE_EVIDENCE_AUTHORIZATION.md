# v0.24: Case evidence — transactional authorization and architecture

**Compiled by Aturinzire Hargreave.** The private evidence workflow is not a Ugandan official land-title registry.

## Threat model
In v0.23, `CasesService.evidence` retrieved the case, stage, assignment, dispute state and professional status before starting the database write transaction, then inside that transaction locked only the case stage/status. If a reviewer was unassigned, had their user role downgraded, or lost professional accreditation after the first check, they could retain a stale decision and submit evidence.

Likewise, `CasesService.create` checked asset permission outside its transaction before writing a new case. The time-of-check/time-of-use window risked case creation after grant revocation.

## v0.24 controls
- `contexts/verification/infrastructure/current-evidence-authorizer.ts` is the infrastructure adapter for professional and case-write authorization; it is intentionally outside domain/application layers.
- For evidence writes, join `verification_cases` to current `users` membership inside the transaction. Lock the case with `FOR UPDATE`, and lock the actor row with `FOR SHARE`. Require `status='OPEN'`, exact current stage, and administrator or currently assigned reviewer.
- For `FIELD_INSPECTION`, require current `SURVEYOR` role plus unrevoked, unexpired surveyor accreditation; for `LEGAL_REVIEW`, require current `LEGAL_REVIEWER` plus active accreditation; for `FINAL_REVIEW`, require current `ORG_ADMIN`; for other stages, require current `ORG_ADMIN` or `REVIEWER`.
- Lock the matching accreditation row with `FOR SHARE` so concurrent credential revocation cannot silently bypass a successful authorization decision. Authoritative status is held in `professional_accreditations`, not in cached `professionalApproved` on a token.
- Check unresolved disputes in the same case write transaction, then insert evidence and write the audit event. These operations commit or roll back together.
- Case creation uses `requireCurrentAssetContribution` inside its transaction, with `allowedActorRoles` checking the current persisted role. Pre-request checks remain only an early, non-authoritative filter.
- The SQL selects `p.user_id`: the actual primary key of `professional_accreditations` in migration 005.

## Security limitations and future audit
This checkpoint does not retroactively validate old evidence submissions, guarantee a dispute cannot be inserted concurrently unless dispute writers serialize on the case row, or replace a full access-control review across every mutation endpoint. Further audit is needed for the case `reviewEvidence`, `advance`, and `assign` paths, including stale reviewer state and transactional trust checks.

## Tests
Run `npm run verify:v24` to execute 16 offline checks and isolated strict TypeScript verification. For a disposable PostgreSQL test with a built API, use `npm run test:pg:case-evidence:v24` with `NODE_ENV=test`, `ASSETTRUST_E2E_ALLOW_MUTATION=YES`, and a loopback database ending in `_ci` or `_test` after applying migrations. The script rolls back all fixtures. **The live database test was not executed here.**
