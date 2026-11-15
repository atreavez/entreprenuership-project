# AssetTrust v0.40 — Recipient failed-attempt controls and trust boundaries

## Purpose

Control credential-guessing activity for confidential report recipients across multiple AssetTrust API instances, without storing credentials or exposing private report details. This is an extra layer of defense; existing cryptographically random credentials still provide the principal protection.

## Bounded contexts

- Domain: `apps/api/src/contexts/report-sharing/domain/attempt-policy.ts` specifies the fixed 15-minute window, 10-failure lockout, 5-failure warning threshold and clock-boundary logic without database or HTTP imports.
- Infrastructure: `report-sharing.module.ts` locks an existing share row, checks the shared window using PostgreSQL time, commits a failed attempt without throwing inside the transaction, and uses the existing generic 404 response after the transaction.
- Data: `apps/api/sql/018_recipient_attempt_windows.sql` contains a single window per existing share, tenant composite foreign keys, bounded counts and a trigger preventing arbitrary reset/decrease and deletion. Earlier migrations are unchanged.
- Administration: the existing `GET /api/v1/reports/shares` response now includes the tenant-filtered `security` collection (share ID, number of recent failures and timestamps), with no secrets. The private admin console displays a warning and provides existing revocation controls.

## Request behavior

1. Reject malformed input before a database transaction, using the same generic unavailable response.
2. Look up and row-lock the existing UUID share. Unknown IDs create no counter row (reduces storage amplification).
3. Read any attempt window under a row lock using PostgreSQL time. If ten failures occurred within the current 15-minute window, return a denial marker.
4. Check both secrets without exposing which one was wrong. If incorrect, upsert one failure increment, capped at ten; reset to one only after the original 15-minute window expires. Return the denial marker so PostgreSQL **commits the increment**.
5. Outside the completed transaction, convert the marker into the same generic 404 response. When credentials are correct and the window is not blocked, the existing share eligibility, report freshness/integrity, PDF signature and atomic redemption controls still apply.
6. At five or more failures, the admin UI can list a warning only while the window is active. It should not imply an intrusion has been confirmed.

## Important security boundaries

- The new counters are **not** a durable immutable forensic audit. A database operator can alter them with sufficiently privileged access; backup/monitoring tooling must capture security events separately under organizational policy.
- A known share ID is sufficient to provoke a temporary denial of service; user-facing wording remains generic, while approved administrators can revoke and create replacement grants after review.
- The prior in-memory endpoint throttle is not shared among instances. The PostgreSQL limiter is per **existing share ID**, not global/IP-wide protection. Use WAF/reverse-proxy controls and shared throttling for unknown-ID floods and network abuse.
- No verified contact challenge, recipient identity/KYC check or tamper-proof external audit has been added. Two bearer credentials can still be transferred.
- The timestamp `now()` is database transaction time. This protects consistency across application clocks; long lock contention may conservatively extend a block.
- The 15/10/5 policy limits are currently compile-time invariants, not organization-editable settings. Any future admin configuration must use a separate Platform Super Admin control plane with bounds, independent approval, versioning and immutable configuration-change records; organization admins may view warnings and revoke their own shares but not weaken platform safety limits.

## Rollout and rollback

Apply migration 018 using the existing migration ledger after a validated backup and only following 017. It creates an additional table; existing report records, shares and evidence are not rewritten. **Do not edit or delete migration 018 after application.** If necessary, stop the new application deployment and restore an approved backup under a change-control plan; ad-hoc schema downgrades may destroy security evidence. Existing grant statuses and PDF signatures are unaffected.

## Release gates not proven in this environment

`npm ci` with a reviewed lockfile; complete TypeScript and Vite builds; live PostgreSQL foreign-key/trigger/rollback test; two concurrent API instance attempts against one database; authenticated admin and recipient browser journeys; TLS, logging redaction, network abuse limits, key custody, restore drill, legal/privacy/security reviews.
