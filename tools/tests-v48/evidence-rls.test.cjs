'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const migration='apps/api/sql/023_case_evidence_rls.sql';
const src={cases:'apps/api/src/cases.ts',dashboard:'apps/api/src/dashboard.ts',report:'apps/api/src/contexts/report-issuance/infrastructure/report-issuance.module.ts',workflow:'apps/api/src/contexts/verification/infrastructure/postgres-workflow.repository.ts'};
test('migration 023 is additive and enforces tenant row isolation on case evidence',()=>{
 const sql=read(migration),clean=sql.replace(/^--.*$/gm,'').trim();
 assert.match(clean,/^BEGIN;/);assert.match(clean,/COMMIT;$/);
 for(const action of ['ENABLE ROW LEVEL SECURITY','FORCE ROW LEVEL SECURITY','CREATE POLICY case_evidence_tenant_v48','FOR ALL TO PUBLIC','USING','WITH CHECK'])assert(clean.includes(action),action);
 assert.equal((clean.match(/assettrust\.tenant_id/g)||[]).length,2);
 assert.doesNotMatch(clean,/DROP |TRUNCATE|DELETE |UPDATE |BYPASSRLS|SECURITY DEFINER|DISABLE ROW LEVEL SECURITY|USING \(true\)|WITH CHECK \(true\)/i);
});
test('all direct case evidence reads and writes are enclosed in tenant scoped transactions',()=>{
 const cases=read(src.cases),dash=read(src.dashboard),report=read(src.report),workflow=read(src.workflow);
 assert.match(cases,/async evidence\([^]*?this\.db\.transaction\(async tx=>\{\s*await setTenantScope\(tx,u\.organizationId\);/);
 assert.match(cases,/async listEvidence\([^]*?this\.db\.transaction\(async tx=>\{\s*await setTenantScope\(tx,u\.organizationId\);/);
 assert.match(dash,/async report\([^]*?this\.db\.transaction\(async tx=>\{\s*await setTenantScope\(tx,u\.organizationId\);[^]*?await requireCurrentCaseRead\(tx,u,caseId\);[^]*?const evidence=await tx\.query\(`/);
 assert.match(report,/private async snapshot\([^]*?await setTenantScope\(tx,u\.organizationId\);[^]*?FROM case_evidence/);
 for(const method of ['getCase','getEvidence','getEvidenceForStage'])assert.match(workflow,new RegExp(`${method}:async\\([^]*?await setTenantScope\\(connection,orgId\\);`),method);
});
test('all current application evidence SQL references are within scoped services',()=>{
 const dir=path.join(root,'apps/api/src');const hits=[];
 const walk=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(e.name.endsWith('.ts')&&fs.readFileSync(f,'utf8').includes('case_evidence')&&!f.endsWith('schema-manifest.ts'))hits.push(path.relative(root,f).replaceAll('\\','/'));}};
 walk(dir);
 const known=[...Object.values(src),'apps/api/src/contexts/verification/infrastructure/current-evidence-authorizer.ts','apps/api/src/database.ts','apps/api/src/contexts/tenant-isolation/domain/rls-policy-contract.ts'].sort();
 assert.deepEqual(hits.sort(),known,'Unreviewed evidence SQL access path: audit and scope it before extending');
});
test('startup fails closed if case evidence RLS or a safe runtime role is absent',()=>{
 const db=read('apps/api/src/database.ts');
 assert(db.includes("'public.case_evidence'::regclass"));
 assert(Number(db.match(/tables\.length!==(\d+)/)?.[1])>=6,'the original six RLS relations must remain required');
 assert.match(db,/rolsuper\|\|roles\[0\]\.rolbypassrls/);
 assert.match(db,/relrowsecurity\|\|!r\.relforcerowsecurity/);
 assert.match(db,/tables\.some\(\(r:any\)=>r\.table_owner===currentRole\)/);
});
test('manifest append-only fingerprint matches new migration exactly',()=>{
 const {buildPlan}=require('../migrations/plan.cjs');const plan=buildPlan();
 assert(plan.length>=23);assert.equal(plan[22].filename,'023_case_evidence_rls.sql');
 const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,migration))).digest('hex');
 assert.equal(plan[22].sha256,hash);
 assert(read('apps/api/src/contexts/platform/domain/schema-manifest.ts').includes(`filename: '023_case_evidence_rls.sql', sha256: '${hash}'`));
});
test('disposable live contract must use non-owner role, deny-all missing scope and reject cross-tenant writes',()=>{
 const s=read('tools/e2e-pg-evidence-rls-v48.mjs');
 assert(s.indexOf('validateDisposablePgTarget(process.env)')<s.indexOf("await import('pg')"));
 for(const x of ['SET LOCAL ROLE','NOBYPASSRLS','SAVEPOINT forbidden',"e.code==='42501'",'ROLLBACK','set_config(\'assettrust.tenant_id\'']) assert(s.includes(x),x);
});
test('CI requires the version and disposable live test and does not permit bypass',()=>{
 const workflow=read('.github/workflows/ci.yml'),pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts['verify:v48'],'node --test tools/tests-v48/*.test.cjs');
 assert.equal(pkg.scripts['test:pg:evidence-rls:v48'],'node tools/e2e-pg-evidence-rls-v48.mjs');
 assert(workflow.includes('npm run verify:v48'));
 assert.match(workflow,/Verify case evidence tenant RLS on disposable PostgreSQL[\s\S]*?ASSETTRUST_E2E_ALLOW_MUTATION: YES[\s\S]*?npm run test:pg:evidence-rls:v48/);
});
test('previous RLS and cross-tenant relationship migrations are not weakened',()=>{
 const old=read('apps/api/sql/021_pdf_layout_rls.sql');const relation=read('apps/api/sql/022_core_tenant_relationship_integrity.sql');
 assert.equal((old.match(/FORCE ROW LEVEL SECURITY/g)||[]).length,3);
 assert.equal((relation.match(/ADD CONSTRAINT fk_\w+_v47/g)||[]).length,11);
});

test('operator RLS inventory is read-only and explicitly lists protected and remaining core tables',()=>{
 const sql=read('tools/sql/v48-rls-readonly-audit.sql');
 assert(sql.includes('BEGIN TRANSACTION READ ONLY;'));assert(sql.includes('ROLLBACK;'));
 for(const name of ['case_evidence','assets','verification_cases','documents','users','report_pdf_layout_active'])assert(sql.includes(`'${name}'`));
 const clean=sql.replace(/^--.*$/gm,'');assert.doesNotMatch(clean,/\b(?:INSERT|UPDATE|DELETE|ALTER|TRUNCATE|CREATE|DROP)\b/i);
});
