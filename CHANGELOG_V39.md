# AssetTrust v0.39 — Confidential recipient report sharing

Added a tenant-scoped, MFA-protected, independently approved recipient capability workflow for confidential verification PDFs. Grants have separate 256-bit token and access-code credentials, up to 168 hours expiry after approval, up to five server-side redemptions, explicit revocation and append-only redemption events. Current report safety gates are rechecked during redemption. Recipients download the existing signed PDF and detached Ed25519 receipt through a rate-limited POST.

Added PostgreSQL migration `017_report_recipient_shares.sql`, domain-policy unit tests, mock service tests, a gated disposable PostgreSQL contract script, a recipient page, and admin share management UI. No official government title verification or verified recipient identity is claimed.

**Release:** offline test checkpoint only. Live compilation, dependency installation, real database and browser integration remain unverified in this environment.
