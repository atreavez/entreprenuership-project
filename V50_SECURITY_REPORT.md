# AssetTrust v0.50 - Confidential Document Metadata RLS

**Release verdict: NO-GO - development checkpoint only.** 11 November 2026.

## Security change

`025_documents_rls.sql` introduces organization-scoped read/write isolation for private metadata. Requests without a valid transaction-local tenant cannot see the records. The same policy checks the organization on new/updated rows. Runtime startup requires the policy and fails for privileged or owner roles.

The credentialing workflow's supporting-document lookup is now tenant scoped inside its current SQL transaction. Its original checks for uploader and organization remain in place. Other existing document services were reviewed and still check asset/case access permissions before returning encrypted document bytes.

## Test evidence and limitations

| Test group | Verified in this environment |
|---|---|
| v0.50 targeted security/unit/source checks | **9/9 PASS** |
| Offline version commands v0.03 to v0.50 | **48/48 PASS** (across recorded runs) |
| Architecture check | **PASS** |
| Static CI completeness | **PASS**, 48 version suites and 24 declared PG contracts |
| TypeScript/TSX transpile-only scan | **PASS**, 102 files; not a typecheck/build |
| Migration source-to-manifest SHA-256 | **25/25 MATCH** |
| Snapshot high-confidence source secret scanner | **PASS**, 1,981 files; not Git history |
| Disposable PostgreSQL v0.50 contract | **NOT RUN**, requires local PostgreSQL, installed `pg`, and explicit authorization |
| Dependency installation (`npm ci --offline`) | **FAILED**: genuine `package-lock.json` absent |
| API/web full build (`npm run build`) | **FAILED**: missing installed packages/types |
| Full application build, live browser tests, production perimeter | **UNVERIFIED** |
| Readiness preflight | **BLOCKED**, 3/11 prerequisites present |

The v0.50 test was first run with 6/8 failures (RED). After implementation it passed 8/8, then a read-only audit test was added (9/9). Historical test fixtures that had hardcoded the earlier table inventory were updated and re-run; see the individual logs under `test-evidence/v50`.

## Required release gates

1. Generate/review/commit an authentic dependency lockfile in the canonical Git repository, run clean `npm ci`, production dependency audit, all unit tests and a successful API/web build.
2. Run all migrations and v0.46-v0.50 live RLS contracts against an explicitly authorized disposable PostgreSQL/PostGIS environment. Test two independently authenticated tenant users and permission revocation.
3. Verify that the deployed DB role cannot own or bypass RLS; inspect pool/session tenant-context cleanup after rollback and commit.
4. Validate actual encrypted uploads/downloads, professional-accreditation uploads, case changes, report issuance, recipient sharing and public report verification through a browser with HTTPS/TLS.
5. Complete malware scanning, HSTS/CSRF/cookies/firewall/SSH tests, CI artifact review, dependency vulnerabilities, restore drills, full Git-history secret scan and any key rotations, and independent penetration review.
6. Record findings and remediation evidence; never treat offline checks as a production approval.

**Decision: NO-GO for public launch, customer data and legal claims.**
