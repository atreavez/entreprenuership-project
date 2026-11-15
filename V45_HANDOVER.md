# AssetTrust v0.45 - Handover

**Milestone:** Database-backed distributed login attempt protection.  
**Release status:** NO-GO for production.  
**Source:** `AssetTrust_v45_Distributed_Login_Security_Checkpoint.zip`.

## Implemented

- Atomic account attempt reservation in PostgreSQL before Argon2 verification, even with concurrent API replicas.
- High-entropy HMAC-keyed account identities with no raw emails/passwords/IPs in the limiter table.
- Maximum 10 attempts in 15 minutes; eleventh denied HTTP 429 using DB time.
- Counter reset after successful password-only authentication or completed MFA, but not on a pending/failed second factor.
- Production startup refusal for missing/weak/reused HMAC pepper.
- Migration `020_distributed_login_abuse.sql`, immutable fingerprints updated, historical tests preserved.
- CI generation of a distinct secret plus new offline tests and an authorized test-database contract.

## Current evidence

11 new tests pass; 43 version suites pass; 47 offline verification commands pass; 20 SQL fingerprints match; 100 TS/TSX syntax files pass. The high-confidence snapshot scan found no matches in 1,614 files. Real PostgreSQL contention, clean install/build, whole-history Git scan, cloud controls, TLS/browser journeys and the full security release gate are not verified.

## Next priorities

1. Obtain genuine npm lockfile, `npm ci`, complete typecheck/build, dependency audit and CI execution.
2. Execute migration and v0.45 concurrency test on a disposable PostgreSQL database; validate two real API instances.
3. Implement DB role separation, request-scoped transactions, row-level tenant security and adversarial tests.
4. Finish source-IP/edge rate limiting, MFA challenge abuse monitoring, malware-scanned uploads and all cross-project security gate requirements.

**Do not publish or connect real land records until the final security gate is approved.**
