/** v0.11 migration contract. Update only with a reviewed migration release. */
export const REQUIRED_SCHEMA_MIGRATIONS = [
  {filename: '001_init.sql', sha256: 'e05f299f8ab72984601233bc48b3077228e9a3de96aee93fe7ca5eb0eca6202a'},
  {filename: '002_operations.sql', sha256: 'c413a946c16f4d9977b284960e43ae964a22e95d37a3bc56acc213bf0b741b15'},
  {filename: '003_evidence_review.sql', sha256: 'bb990ff9e2481274145f53e050002f0ba7c6ceb2def07acfd0216b18aaee6812'},
  {filename: '004_identity_security.sql', sha256: 'd6ada4fabf873d141c33df01ffec8741c5cba75b256ec4eedc77990c6791a5c2'},
  {filename: '005_professional_trust.sql', sha256: '21548bdf4b485a3524e6cf2ec1f54b6df16020d166d11a234aad96cb6f0df523'},
  {filename: '006_document_encryption.sql', sha256: 'a155e59f70c166cb9d7c06a93a3b91d03a8ac40b16c9245ccd384429fa7e501e'},
  {filename: '007_geospatial.sql', sha256: 'c8d4fe1d2a7fc38a8c5a195f6132b4e1dcdd579dc8d6a89307f881ede828ec94'},
] as const;
export const REQUIRED_POSTGIS_TABLES = ['organizations','users','assets','verification_cases','case_evidence','documents','audit_events','auth_sessions','professional_accreditations','parcel_boundary_claims'] as const;
