# AssetTrust v0.52 — malware-screened confidential document uploads

**11 November 2026. Release status: NO-GO.**

This release checkpoint adds a **fail-closed ClamAV malware-scanning boundary** to the authenticated document-upload path. The uploader still enforces a 5 MiB limit, permitted PDF/PNG/JPEG/WebP types, document magic bytes, authorization, tenant-scoped database access, encrypted storage, and audit history. **New behavior:** the exact in-memory upload bytes must receive an explicit `stream: OK` response from a locally trusted ClamAV INSTREAM service **before** encrypted blob storage or document metadata insertion. A virus verdict, unknown response, scanner outage, network error or timeout stops the upload without writing the document.

## Engineering changes

- `apps/api/src/contexts/document-vault/application/malware-scanner.port.ts`: dependency-free application scanner contract, with typed `INFECTED` and `UNAVAILABLE` failures.
- `apps/api/src/contexts/document-vault/infrastructure/clamav-instream-scanner.ts`: bounded 64-KiB ClamAV INSTREAM framed upload; absolute Unix socket in production; loopback-only TCP for test/development; 15-second hard upper timeout; strict response parsing; error and disconnect fail-closed.
- `apps/api/src/documents.ts`: scanner injected by NestJS, invoked after access checks and before blob persistence. Infected uploads return a generic 400; scanner outages return a generic 503, with no private malware signature or storage path details exposed.
- `apps/api/src/contexts/platform/domain/runtime-config.ts`: production config rejects absent/malformed ClamAV Unix socket path and TCP mode.
- `tools/clamav-live-contract-v52.cjs`: explicitly calls a **real** configured daemon and checks benign data is accepted while harmless EICAR test bytes are rejected.
- `tools/release-validation-v51.cjs`: includes the live ClamAV contract in guarded Kali validation plans, while retaining fail-closed no-lockfile and disposable-database guards.
- `.github/workflows/ci.yml`: ClamAV service and a bounded, mandatory real-daemon readiness/clean-and-threat contract before HTTP upload suites.
- `tools/tests-v52`: 13 new offline tests; v0.23 upload tests now explicitly inject a fake clean scanner to preserve original authorization assertions. Historical v0.12, v0.43, v0.45 production-config test fixtures now reflect mandatory scanner configuration. Historical v0.51 version check accepts future semantic versions while keeping workspace-version equality.
- Root, API and web package versions updated to `0.52.0`. `main.ts` health response now reflects `0.52.0`.

## Important limitations

**Not tested against a real ClamAV service in this environment.** The live ClamAV contract was attempted and failed because the scanner is absent/unconfigured; this is a release blocker, not a security bypass. No genuine npm lockfile or installed project dependencies are present, so the full TypeScript build and real API/browser/database integration remain blocked. No SQL migration was added; the 25 previous SQL migration hashes were preserved. Full Git history was not available for independent secret scanning.

**Never deploy to production with mock scanners, a public ClamAV TCP port, disabled signatures, a legacy API instance bypassing the scanner, or an unset `CLAMAV_SOCKET_PATH`.**
