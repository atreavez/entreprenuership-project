# AssetTrust v0.36 — Signed private evidence bundle export

- Added Ed25519 domain-separated canonical export and verification logic with strict snapshot digest/schema controls.
- Added tenant-scoped, fresh-MFA private `signed-export` endpoint for existing non-official issued reports and a public key metadata route.
- Added audited browser download and independent offline verification utility; added safe local key generation utility.
- Preserved v0.35 withdrawal precedence and public QR access boundary; no new migration or private evidence disclosure on public routes.
- Added v0.36 signature, tamper, independent key trust, tenant, MFA, integrity failure, withdrawn status and audit tests.
- Improved offline legacy v0.34 and v0.35 harness mappings for new domain imports; historical SQL migration files remain unchanged.
- Production release remains blocked by dependency install/build, live PostgreSQL/PostGIS, real browser flows, signed PDF, key-distribution/revocation governance, and security review.
