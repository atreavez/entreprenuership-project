# AssetTrust v0.52 — Independent checkpoint security report

Date: 11 November 2026  
Release decision: **NO-GO: no production/customer data deployment**  
Scope: v0.51 source archive upgraded to v0.52; focused document upload scanning controls, targeted tests, regression checks and available offline gates.

## What changed

The document service checks the user's role, organization and resource access before scanning a supported file. It then streams the exact upload bytes to a server-local ClamAV service using the INSTREAM protocol. Only the literal ClamAV clean verdict allows encrypted storage and database insertion. Unknown responses, scanner downtime, timeouts and detection block the write. The upload endpoint returns generic errors so scanner details are not revealed to clients. Existing encrypted local blob storage, tenant RLS, file signature/size rules and audit trails remain in place.

The production configuration contract demands an absolute local Unix socket; remote scanning endpoints and insecure TCP are prohibited in production. The reusable application scanner interface keeps the security requirement independent from the NestJS infrastructure adapter.

## Executed evidence

- v0.52 targeted tests: **13/13 passed**. Real service code exercised against a simulated local ClamAV Unix socket, including the explicit clean, threat, invalid response, socket disconnect, 64-KiB stream framing, and timeout conditions. The upload-service test verifies the scanner runs before encrypted persistence; rejected scans do not call the blob-store or metadata insert.
- Historical version suites **v0.03–v0.52: 50/50 command suites passed** in multiple batches. The long initial batch was split after timing out following v0.29; later suites and repaired v0.51 version expectation passed.
- Architecture checks: **3/3 passed**; TypeScript/TSX **104 files syntax-transpiled with no diagnostics**, but this is **not** an npm TypeScript typecheck/build.
- Static CI coverage: **PASS**, 50 declared version suites, 24 PostgreSQL contracts, ClamAV live contract included in CI and supervised release validation.
- Previous SQL migration fingerprint audit: **25/25 unchanged**. No database migration was added.
- Current-source high-confidence secret scan: **2,079 files, zero detected matches**. Not equivalent to full-history or independent secrets scanning.
- Real ClamAV self-check: **FAILED/BLOCKED**, no configured daemon here. No genuine detection test ran.
- Supply-chain policy: **BLOCKED**, genuine npm lockfile missing.
- Application build: **FAILED due to missing npm dependencies/types**.
- Release preflight: **BLOCKED, 3/11 prerequisites present**. No PostgreSQL, browser, public HTTPS or deployment penetration test evidence.

## Unresolved security blockers

1. Configure a real isolated ClamAV daemon with current signatures on staging/Kali; run `npm run security:clamav:v52` and live uploads (including EICAR), including outage behavior and no unauthorized blob writes.
2. Obtain and review authentic npm lockfile, install with `npm ci`, run `npm audit`, full API/web builds and all integration tests; remediate high/critical dependencies.
3. Run all applicable PostgreSQL migrations and tenant RLS contracts in a dedicated disposable DB, then verify application-account least privilege and cross-tenant access across at least two live API instances.
4. Audit all upload entrypoints, gateway body-size limits, quotas, content delivery, private object storage and scanner socket permissions on the actual deployment; an antivirus scanner does not ensure all malicious files are caught.
5. Full canonical Git-history secrets scan and credential rotation as necessary; security review for HTTPS, SSH, CSRF, cookies, MFA, authorization, server-side validation, server-authoritative payments and backup restore.
6. Obtain independent adversarial testing, Uganda data/privacy/legal review and signed release approval before real customer assets/evidence or payments are accepted.

**Verdict:** Development security improvement implemented and offline-tested; full scanner efficacy, integration, platform and deployment security remain unverified. Production release remains blocked.
