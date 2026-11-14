-- AssetTrust v0.47 operator read-only pre-migration audit.
-- Run on a VERIFIED database backup/clone. Returns aggregate counts only;
-- it DOES NOT repair data, alter RLS, or expose private record contents.
BEGIN TRANSACTION READ ONLY;
WITH violations AS (
 SELECT 'assets.created_by' AS relationship, COUNT(*)::bigint AS violations
   FROM assets a LEFT JOIN users u ON u.id=a.created_by
   WHERE u.id IS NULL OR u.organization_id IS DISTINCT FROM a.organization_id
 UNION ALL
 SELECT 'cases.asset',COUNT(*)::bigint FROM verification_cases c
   LEFT JOIN assets a ON a.id=c.asset_id
   WHERE a.id IS NULL OR a.organization_id IS DISTINCT FROM c.organization_id
 UNION ALL
 SELECT 'cases.created_by',COUNT(*)::bigint FROM verification_cases c
   LEFT JOIN users u ON u.id=c.created_by
   WHERE u.id IS NULL OR u.organization_id IS DISTINCT FROM c.organization_id
 UNION ALL
 SELECT 'cases.assigned_to',COUNT(*)::bigint FROM verification_cases c
   LEFT JOIN users u ON u.id=c.assigned_to
   WHERE c.assigned_to IS NOT NULL AND (u.id IS NULL OR u.organization_id IS DISTINCT FROM c.organization_id)
 UNION ALL
 SELECT 'evidence.case',COUNT(*)::bigint FROM case_evidence e
   LEFT JOIN verification_cases c ON c.id=e.case_id
   WHERE c.id IS NULL OR c.organization_id IS DISTINCT FROM e.organization_id
 UNION ALL
 SELECT 'evidence.recorded_by',COUNT(*)::bigint FROM case_evidence e
   LEFT JOIN users u ON u.id=e.recorded_by
   WHERE u.id IS NULL OR u.organization_id IS DISTINCT FROM e.organization_id
 UNION ALL
 SELECT 'evidence.reviewed_by',COUNT(*)::bigint FROM case_evidence e
   LEFT JOIN users u ON u.id=e.reviewed_by
   WHERE e.reviewed_by IS NOT NULL AND (u.id IS NULL OR u.organization_id IS DISTINCT FROM e.organization_id)
 UNION ALL
 SELECT 'documents.asset',COUNT(*)::bigint FROM documents d
   LEFT JOIN assets a ON a.id=d.asset_id
   WHERE d.asset_id IS NOT NULL AND (a.id IS NULL OR a.organization_id IS DISTINCT FROM d.organization_id)
 UNION ALL
 SELECT 'documents.case',COUNT(*)::bigint FROM documents d
   LEFT JOIN verification_cases c ON c.id=d.case_id
   WHERE d.case_id IS NOT NULL AND (c.id IS NULL OR c.organization_id IS DISTINCT FROM d.organization_id)
 UNION ALL
 SELECT 'documents.uploaded_by',COUNT(*)::bigint FROM documents d
   LEFT JOIN users u ON u.id=d.uploaded_by
   WHERE u.id IS NULL OR u.organization_id IS DISTINCT FROM d.organization_id
 UNION ALL
 SELECT 'documents.case_asset_pair',COUNT(*)::bigint FROM documents d
   LEFT JOIN verification_cases c ON c.id=d.case_id
   WHERE d.case_id IS NOT NULL AND d.asset_id IS NOT NULL
     AND (c.id IS NULL OR c.asset_id IS DISTINCT FROM d.asset_id)
)
SELECT relationship, violations FROM violations ORDER BY relationship;
ROLLBACK;
