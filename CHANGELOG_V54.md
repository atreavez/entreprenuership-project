# AssetTrust v0.54 - Batched Git-history secret verification

Date: 11 November 2026. Security release decision: NO-GO.

## Completed implementation

- Replaced the slow per-object historical inspection in `tools/secret-scan-v43.cjs` with a batched, bounded and fail-closed Git object reader in `tools/git-history-batch-v54.cjs`.
- Scanner now inspects Git blobs, commit messages and annotated tag objects for high-confidence secret formats, including commits retained only in local reflogs (e.g., a recently reset/removed commit).
- Historical content is classified in memory; the report emits only an abbreviated Git object ID and finding category, not plaintext secrets.
- Explicitly rejects shallow history, absent `.git`, unreadable Git objects, invalid batch responses, oversized scan workloads and large objects requiring independent review.
- Added `--repo <path>` to scan an actual original Git clone without copying its `.git` directory into the source ZIP.
- Added `security:scan:v54` and `verify:v54` npm scripts, CI execution coverage and a real parser-backed workflow requirement for v0.54 history scanning.
- Added 15 new tests using actual temporary Git repositories (including deleted files, reflog-only commits, commit messages, sensitive historical filenames, shallow clones, large blobs, CLI targeting and CI omissions).
- Synchronized root/API/web versions to 0.54.0.

## Retained unchanged

- Database SQL migrations 001-025 (no new migration, no data mutation).
- Existing HTTP API routes, schemas, authentication and frontend behavior.
- The prior v0.52 ClamAV upload gate and v0.46-v0.50 staged RLS code.

## Limits

The historical scanner uses a limited set of signature patterns and local refs/reflogs. Expired reflogs, pruned unreachable objects, remote forks, GitHub Actions environment secrets and other providers are not covered. Separate Gitleaks/TruffleHog scans, credential rotation and independent review are required.

This source ZIP contains no original `.git` history. Its historical scan **must fail** until run against your real clone.
