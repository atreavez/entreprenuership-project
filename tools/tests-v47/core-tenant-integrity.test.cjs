'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const migrationPath='apps/api/sql/022_core_tenant_relationship_integrity.sql';
const constraints={
 fk_assets_creator_tenant_v47:['assets','created_by','users','id'],
 fk_cases_asset_tenant_v47:['verification_cases','asset_id','assets','id'],
 fk_cases_creator_tenant_v47:['verification_cases','created_by','users','id'],
 fk_cases_assignee_tenant_v47:['verification_cases','assigned_to','users','id'],
 fk_evidence_case_tenant_v47:['case_evidence','case_id','verification_cases','id'],
 fk_evidence_recorder_tenant_v47:['case_evidence','recorded_by','users','id'],
 fk_evidence_reviewer_tenant_v47:['case_evidence','reviewed_by','users','id'],
 fk_documents_asset_tenant_v47:['documents','asset_id','assets','id'],
 fk_documents_case_tenant_v47:['documents','case_id','verification_cases','id'],
 fk_documents_uploader_tenant_v47:['documents','uploaded_by','users','id']
};
test('migration is atomic and never weakens existing RLS or skips validation',()=>{
 const source=read(migrationPath).replace(/^--.*$/gm,'').trim();
 assert.match(source,/^BEGIN;/);assert.match(source,/COMMIT;$/);
 assert.doesNotMatch(source,/NOT VALID|DISABLE TRIGGER|DROP TABLE|DROP POLICY|DISABLE ROW LEVEL SECURITY|ON DELETE CASCADE|BYPASSRLS|SECURITY DEFINER/i);
 assert.equal((source.match(/ADD CONSTRAINT fk_\w+_v47/g)||[]).length,11);
});
test('all 10 cross-tenant references require the composite tenant key',()=>{
 const sql=read(migrationPath);
 for(const [name,[table,column,parent,parentCol]] of Object.entries(constraints)){
  const re=new RegExp(`ALTER TABLE public\\.${table} ADD CONSTRAINT ${name}\\s+FOREIGN KEY \\(organization_id, ${column}\\)\\s+REFERENCES public\\.${parent} \\(organization_id, ${parentCol}\\);`);
  assert.match(sql,re,`missing or weak composite FK ${name}`);
 }
});
test('document asset and case must be consistent when both are specified',()=>{
 const sql=read(migrationPath);
 assert(sql.includes('UNIQUE (organization_id, id, asset_id);'));
 assert(sql.includes('FOREIGN KEY (organization_id, case_id, asset_id)\n  REFERENCES public.verification_cases (organization_id, id, asset_id);'));
});
test('all referenced parents have explicit composite UNIQUE keys',()=>{
 const sql=read(migrationPath);
 for(const [table,name] of [['users','uq_users_organization_id_id_v47'],['assets','uq_assets_organization_id_id_v47'],['verification_cases','uq_cases_organization_id_id_v47']])
  assert(sql.includes(`ALTER TABLE public.${table} ADD CONSTRAINT ${name}\n  UNIQUE (organization_id, id);`));
});
test('new migration is appended to immutable checksum plan, with exact bytes',()=>{
 const {buildPlan}=require('../migrations/plan.cjs');
 const plan=buildPlan();
 assert(plan.length>=22,'Historical migration 022 must remain present');
 assert.equal(plan[21].filename,'022_core_tenant_relationship_integrity.sql');
 const bytes=fs.readFileSync(path.join(root,migrationPath));
 const digest=crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(plan[21].sha256,digest);
 const manifest=read('apps/api/src/contexts/platform/domain/schema-manifest.ts');
 assert(manifest.includes(`filename: '022_core_tenant_relationship_integrity.sql', sha256: '${digest}'`));
});
test('existing migration 021 RLS controls remain intact and no RLS is overstated',()=>{
 const old=read('apps/api/sql/021_pdf_layout_rls.sql');
 assert.equal((old.match(/FORCE ROW LEVEL SECURITY/g)||[]).length,3);
 const sql=read(migrationPath);
 assert(!/ENABLE ROW LEVEL SECURITY/.test(sql.replace(/^--.*$/gm,'')));
});
test('version check and disposable PostgreSQL contract are mandatory in CI',()=>{
 const yaml=read('.github/workflows/ci.yml'),pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts['verify:v47'],'node --test tools/tests-v47/*.test.cjs');
 assert(yaml.includes('npm run verify:v47'));
 assert(yaml.includes('npm run test:pg:core-relations:v47'));
 assert.match(yaml,/Verify core tenant relationship constraints[\s\S]*?ASSETTRUST_E2E_ALLOW_MUTATION: YES/);
});
test('live PostgreSQL test refuses non-disposable targets before import or connection',()=>{
 const source=read('tools/e2e-pg-core-relations-v47.mjs');
 assert(source.indexOf('validateDisposablePgTarget(process.env)')<source.indexOf("await import('pg')"));
 assert(source.includes('ROLLBACK'));
 assert(source.includes('23503'));
});
test('operator preflight checks every relation without mutating customer data',()=>{
 const sql=read('tools/sql/v47-core-integrity-audit.sql');
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/ROLLBACK;/);
 for(const relationship of ['assets.created_by','cases.asset','cases.created_by','cases.assigned_to','evidence.case','evidence.recorded_by','evidence.reviewed_by','documents.asset','documents.case','documents.uploaded_by','documents.case_asset_pair'])
  assert(sql.includes(`'${relationship}'`),`missing audit check ${relationship}`);
 assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|\bALTER\b/i);
});
test('code contains no cross-tenant bypass such as deleting corrupt rows in migration',()=>{
 const sql=read(migrationPath).replace(/^--.*$/gm,'');
 assert.doesNotMatch(sql,/\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|\bSET\s+session_replication_role/i);
});
