# AssetTrust v0.52 — Engineering handover

**Checkpoint:** Fail-closed ClamAV malware scanning of confidential evidence uploads. **Status:** offline tests green; live release blocked.

## Source changes

- Application scanner port: `apps/api/src/contexts/document-vault/application/malware-scanner.port.ts`
- Local ClamAV adapter: `apps/api/src/contexts/document-vault/infrastructure/clamav-instream-scanner.ts`
- Authenticated upload integration and DI: `apps/api/src/documents.ts`
- Production config: `apps/api/src/contexts/platform/domain/runtime-config.ts`
- Real daemon smoke/EICAR contract: `tools/clamav-live-contract-v52.cjs`
- Release supervision: `tools/release-validation-v51.cjs`
- Test suite: `tools/tests-v52/malware-v52.test.cjs`
- CI: `.github/workflows/ci.yml` (ClamAV service, readiness loop, live contract)
- 0.52.0 versions: three package manifests; health endpoint version updated.
- Historical regression fixtures: v0.12, v0.23, v0.43, v0.45, v0.51 (only to reflect security and version contracts).

No new SQL migration. Do not remove any existing migration; all 25 fingerprints are unchanged.

## Operations

Production must configure `CLAMAV_SOCKET_PATH=/run/clamav/clamd.ctl` (adjust to actual socket path), with permissions restricted to the API service user. Production must not configure `CLAMAV_TCP_PORT`. Test/CI can use `CLAMAV_TCP_PORT=3310`, hardwired to loopback only. Missing or unhealthy scanner causes upload rejection. The scanner is a deployment prerequisite, not an optional nice-to-have.

**First connected Kali actions:** verify backups and Git history; generate a genuine lockfile with review; `npm ci`; `npm run security:clamav:v52`; `npm run verify:v52`; `npm test && npm run build`; run the supervised validation and disposable PostgreSQL contracts; perform authenticated browser tests with two organizations. See `V52_KALI_VALIDATION.md`.

## Known limitations

Scans only the existing authenticated document-upload entrypoint identified in this source. Future import/bulk-upload pathways must use the same scanner contract. Parser is ClamAV INSTREAM and does not inspect files downloaded from existing storage or replace file sandboxing/content sanitization. No actual ClamAV service, npm dependency installation, full build, real PostgreSQL service or complete Git history were available here. **Release remains NO-GO.**
