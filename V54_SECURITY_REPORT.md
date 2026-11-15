# AssetTrust v0.54 - Security engineering report

**Assessment date:** 11 November 2026  
**Checkpoint:** AssetTrust source v0.54  
**Release decision: NO-GO - NOT PRODUCTION READY.**

## Executive findings

A release-critical weakness in earlier secret scanning was addressed. The old history scanner launched up to three separate Git processes per historical object, which could become impractical for a long-lived project. The new path uses Git batch metadata/content requests with strict object budgets and explicit failures on incomplete history. It also inspects commit messages and locally retained reflog commits, not only the current files.

The code cannot prove that the real AssetTrust Git repository is clear of secrets: the checkpoint is a source ZIP without `.git` metadata. The historical scan correctly returns a blocked result in this environment. No real credentials were viewed or rotated.

## New protections and evidence

| Control | Observation |
| --- | --- |
| Historical Git object scanning | Batched Git reads implemented with bounded buffers and complete-run failure conditions |
| Deleted file secrets | Test credential added, committed, removed and detected in prior commit |
| Discarded commits | Test credential in a reset/reflog-only commit detected |
| Commit-message secrets | Test credential in historical commit message detected |
| Filename and oversized-object review | Historical `.env.production` and oversized blob are flagged |
| Shallow/no Git history | Blocked, never reported as clean |
| Secret redaction | Git object prefix and finding type returned; secret bytes are not printed |
| Actual Git targeting | `--repo` can inspect the user's original clone from the newer scanner |
| CI policy | Requires v0.54 tests and a historical scan; workflow YAML parser passed |

## Executed verification

- **15/15 new v0.54 tests passed**, using real local disposable Git repositories (not mock Git output).
- **52/52 version verification suites passed** (v0.03 through v0.54).
- Architecture, TypeScript/TSX syntax, CI completeness, YAML semantics and offline smoke tests passed.
- **25/25 SQL migration source fingerprints match v0.53** (no new migrations).
- Pre-documentation source snapshot secret scan: no high-confidence findings; this does not prove a clean history.
- Release plan currently requires **89 stages**: 61 build/security checks and 28 database/integration checks.

## Required failures and unexecuted checks

| Release gate | Current observation |
| --- | --- |
| Original Git history audit | NOT RUN; v0.54 source ZIP has no `.git`; runner correctly blocked |
| Genuine npm lockfile | MISSING; `npm ci --offline` failed |
| API and web builds | FAILED; missing installed packages/types such as NestJS and `@types/node` |
| API unit tests | BLOCKED; dependencies absent |
| Real ClamAV | BLOCKED; daemon/socket not available in this environment |
| PostgreSQL RLS and migration E2E | NOT RUN; no disposable PostGIS instance available |
| Two-API and HTTP end-to-end tests | NOT RUN; server/database/dependencies unavailable |
| Authenticated browser/HTTPS/SSH/firewall/backup review | NOT RUN; no actual deployment access |
| v0.41 preflight | 3 of 11 prerequisites present; BLOCKED |

## Security limitations

This is a high-confidence pattern scanner, not proof of zero leaked keys. It does not inspect unreachable objects already pruned from local Git, remote clones or forks, repository hosting secrets, CI/CD secrets, commit signatures outside accessible Git objects, external SaaS logs or credentials stored outside Git. Large historical objects are reported for manual review, not silently ignored.

Sensitive real tokens detected in history must be **revoked and rotated with their providers immediately**. Removing a file from HEAD or force-pushing a rewritten history does not revoke an exposed token. Only an approved repository clean-up plan should rewrite shared history.

## Production release decision

**NO-GO.** Mandatory hardening from the cross-project security standard still requires actual npm installation/builds, dependency vulnerability review, independent full-history scan, real PostgreSQL RLS tests using least-privileged roles, ClamAV virus-screening checks, authenticated browser journeys, security perimeter tests and a tested backup/restore before a commercial pilot can be approved.
