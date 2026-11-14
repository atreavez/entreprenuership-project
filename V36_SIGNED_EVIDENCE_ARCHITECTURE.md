# AssetTrust v0.36 — Independently Verifiable Private Evidence Bundle

**Scope:** authenticated JSON export of existing, immutable, non-official report snapshots. This checkpoint is **not** a PAdES-signed PDF, government registry integration, blockchain anchor, or ownership certification. The signature is created **when the authorized administrator downloads the bundle**, not retrospectively at the historical report issuance timestamp.

## What is new

- A new domain module, `apps/api/src/contexts/report-issuance/domain/signed-attestation.ts`, constructs a versioned private payload with a SHA-256-verified snapshot and signs a domain-separated, canonical JSON message using **Ed25519**.
- Current organization admins with **live membership, enabled MFA and recent step-up** can request `GET /api/v1/reports/issued/:id/signed-export`. The SQL read is scoped to `organization_id`, refuses a digest mismatch and creates an audit event before returning confidential evidence.
- The existing report issuance UI lets an administrator download `assettrust-signed-evidence-<UUID>.json`. The JavaScript download occurs locally; the server does not upload it to a third-party signing or PDF service.
- An unauthenticated public endpoint `GET /api/v1/reports/verify/signing-key` publishes **only the currently configured public key** and its SHA-256 fingerprint. The private key is never returned.
- Offline `tools/verify-report-bundle-v36.cjs` verifies signatures, canonical hashes, schema and non-official caveats **without any npm packages or network access**. It requires a trusted, separately obtained public-key JSON document.
- `tools/generate-report-key-v36.cjs` makes a new Ed25519 pair, writes the private key file with owner-only permissions, refuses overwrites and prints only the public fingerprint, not the private key.

## Cryptographic scope and threat model

The signed bytes are `UTF8("ASSETTRUST-SIGNED-EVIDENCE-BUNDLE-V1\\n" + canonicalJSON(payload))` and use a 64-byte Ed25519 signature. The payload contains: report reference, original issue timestamp, export timestamp, current-at-export status, an explicit warning that status can change, the original full confidential snapshot and its SHA-256 hash, and the non-official legal notice. The algorithm, domain separator and JSON schema are deliberately fixed; changing them requires a new version.

**Trust comes from an independently pinned public key.** An attacker could generate a new keypair and self-sign a fake report. Accepting a public key from the same untrusted download is *not* independent verification. Key rotation requires securely distributing and retaining prior public keys; compromised keys require an explicit trusted revocation process (not built in v0.36). A valid signature proves key possession and bundle integrity, **not truth of the source evidence**, timestamp attestation by a third party, or continued current status.

Signatures are created on-demand, which means an old issued report can be exported with a *new* signature. The `issuedAt` field is the original database record time; `exportedAt` is local application time, not a trusted timestamp authority. Existing append-only issuance and withdrawal rules are not changed. The public QR verifier continues to provide live status checks. Do not rely solely on a potentially stale exported status.

## Information security

- Exports contain private identifiers, reviewer references and evidence. Only authorized administrators with MFA can download. **Never publish a signed bundle or attach it to the public QR response.** Do not send it to users who do not have lawful access to this evidence.
- No new SQL migration is introduced. The v0.35 database still requires all **15** verified migrations and a PostGIS-enabled disposable test environment for the live validation gates.
- `ASSETTRUST_REPORT_SIGNING_KEY_ID` and `ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64` are secrets/configuration supplied from secure deployment environment or a managed secret store. The signing operation refuses to run if configuration is missing or invalid; no test fallback key is embedded. Use separate unique keys per environment and maintain secure offline backups.
- The signed export is audited as `REPORT_SIGNED_BUNDLE_EXPORTED` with the report ID, signer key ID, export time and hash, not the confidential evidence content. The normal report/withdrawal audit history stays intact.
- Certain controls must **not** be tenant-editable: legal disclaimer, signature algorithm, tenant checks, immutable evidence, current MFA check, public exposure boundary and independent signing-key verification. A future super-admin key registry UI may manage lifecycle *metadata* and approvals, but should never show or accept raw private keys.

## New routes

| Method | Route | Protection |
|---|---|---|
| GET | `/api/v1/reports/issued/:id/signed-export` | Authenticated **current organization admin**, fresh MFA step-up, tenant-scoped, integrity check, audit, private no-store |
| GET | `/api/v1/reports/verify/signing-key` | Public signing key metadata only, no-store; not a substitute for independent trust distribution |

## Gates and limitations

This checkpoint has real offline signature/tamper tests and service unit tests. It does **not** have: an installed dependency lockfile, a full installed TypeScript/NestJS/React build, successful live database migration and PostGIS E2E, authenticated browser tests, independent public-key distribution governance, signed PDF generation, external timestamp authority or production penetration review. Treat release as blocked until those gates are satisfied.
