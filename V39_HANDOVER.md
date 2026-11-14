# AssetTrust v0.39 handover

- **Source**: `assettrust-v39/` complete project archive (application, SQL migration, tests, operator docs, previous changelogs).
- **Change**: `017_report_recipient_shares.sql` appends new tenant-scoped share-grant ledger and append-only successful redemption records. No previously applied SQL files changed.
- **Admin interface**: `Report Issuance → Confidential recipient sharing` proposes, approves/rejects, revokes, and lists successful server-side redemptions. Separate active MFA-authenticated org administrators are mandatory.
- **Recipient interface**: `/#receive/report` accepts Share ID + 256-bit link token + separately delivered 256-bit access code, and returns a private PDF and detached Ed25519 receipt after eligibility check.
- **Security**: no plaintext secrets persisted, no secret-bearing GET URLs, one-time secret display, 1–168 hour TTL measured from approval, 1–5 redemptions, current status/integrity checks and tenant separation.
- **Current scorecard**: 9 new tests pass; 37 historical/version checks pass; architecture and 91-file syntax scan pass. Real dependency build, DB migration and browser tests remain unverified.
- **Start here**: read `V39_KALI_VALIDATION.md`, run tests on a disposable DB, verify backups, then complete the live access-control matrix before any real data.
- **Next suggested milestone (v0.40)**: real end-to-end integration gates and recipient identity binding/verified contact challenge, plus shared rate limiting, audit alerts and signing-key governance. Do not bypass production blockers by adding more UI alone.
