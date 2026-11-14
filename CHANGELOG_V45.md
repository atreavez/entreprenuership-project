# AssetTrust v0.45 - Distributed Login Security

**Date:** 11 November 2026  
**Release decision:** DEVELOPMENT CHECKPOINT - NO-GO for production.

This checkpoint addresses brute-force risk when several API processes serve login requests. `AuthController.login` now atomically reserves an attempt in PostgreSQL **before** password verification. The shared 15-minute window permits at most 10 attempts per normalized account identity. Requests beyond the limit receive HTTP 429 without executing Argon2. The counter is a keyed HMAC digest of the normalized email, never a plaintext email address, password, IP address or token.

- New domain policy: `apps/api/src/contexts/identity/domain/login-abuse-policy.ts`.
- New PostgreSQL infrastructure adapter: `apps/api/src/contexts/identity/infrastructure/login-abuse.service.ts`.
- New forward-only migration: `apps/api/sql/020_distributed_login_abuse.sql`.
- Auth route reserves attempts before password proof; failure retains the counter.
- Valid password alone does not clear the counter if MFA remains pending. A completed valid MFA challenge clears it. Normal password-only login clears on success.
- Production startup rejects a missing, weak, or reused `LOGIN_ABUSE_PEPPER`; development/test login refuses missing pepper through the service.
- CI now generates a separate ephemeral pepper and includes the new offline and guarded PostgreSQL contract.
- The schema fingerprint manifest and prior historical test fixtures have been updated; earlier SQL files remain unchanged.

**Security limitations:** An adversary can deliberately throttle a known account (denial of service). Edge per-source rate limiting, monitoring, lockout alerting, device/session risk analysis and distributed MFA abuse controls need live deployment reviews. No row-level security policy was enabled, because current pooled queries lack a consistently transaction-scoped tenant context. No real PostgreSQL concurrency, TypeScript full build, third-party dependency audit, cloud perimeter or historical Git scan was verified here.

See `V45_SECURITY_REPORT.md`, `TEST_EVIDENCE_V45.md`, `V45_KALI_VALIDATION.md`, and `V45_HANDOVER.md`.
