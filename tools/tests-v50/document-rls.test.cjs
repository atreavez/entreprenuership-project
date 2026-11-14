'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('new forward-only migration enables FORCE RLS with default-deny tenant policy on private document metadata',()=>{
 const sql=read('apps/api/sql/025_documents_rls.sql');
 const clean=sql.replace(/^--.*$/gm,'').trim();
 assert.match(clean,/^BEGIN;/);assert.match(clean,/COMMIT;$/);
 assert.match(clean,/ALTER TABLE public\.documents ENABLE ROW LEVEL SECURITY;/);
 assert.match(clean,/ALTER TABLE public\.documents FORCE ROW LEVEL SECURITY;/);
 assert.match(clean,/CREATE POLICY documents_tenant_v50 ON public\.documents/);
 assert.match(clean,/FOR ALL TO PUBLIC/);
 assert.equal((clean.match(/assettrust\.tenant_id/g)||[]).length,2);
 assert.match(clean,/USING \(organization_id = NULLIF\(current_setting\('assettrust\.tenant_id', true\), ''\)::uuid\)/);
 assert.match(clean,/WITH CHECK \(organization_id = NULLIF\(current_setting\('assettrust\.tenant_id', true\), ''\)::uuid\)/);
 assert.doesNotMatch(clean,/\b(?:DROP|TRUNCATE|DELETE|UPDATE|BYPASSRLS|SECURITY DEFINER)\b|DISABLE ROW LEVEL SECURITY|USING \(true\)|WITH CHECK \(true\)/i);
});

test('migration checksum is committed and previous 24 migrations remain byte-for-byte',()=>{
 const plan=require('../migrations/plan.cjs').buildPlan();
 assert(plan.length>=25);
 assert.equal(plan[24].filename,'025_documents_rls.sql');
 const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'apps/api/sql/025_documents_rls.sql'))).digest('hex');
 assert.equal(plan[24].sha256,sha);
 assert(read('apps/api/src/contexts/platform/domain/schema-manifest.ts').includes(`filename: '025_documents_rls.sql', sha256: '${sha}'`));
 const priorManifest=read('apps/api/src/contexts/platform/domain/schema-manifest.ts');
 for(let i=0;i<24;i++)assert(priorManifest.includes(`sha256: '${plan[i].sha256}'`));
});

test('production startup demands documents RLS and rejects elevated/owner DB roles',()=>{
 const s=read('apps/api/src/database.ts');
 assert(s.includes("'public.documents'::regclass"));
 assert(Number(s.match(/tables\.length!==(\d+)/)?.[1])>=8,'original eight RLS tables must be retained');
 for(const t of ['assets','verification_cases','case_evidence','report_pdf_layout_proposals','report_pdf_layout_revisions','report_pdf_layout_active']) assert(s.includes(`'public.${t}'::regclass`));
 assert(s.includes('rolbypassrls')&&s.includes('rolsuper')&&s.includes('table_owner===currentRole'));
 assert(s.includes('!r.relrowsecurity||!r.relforcerowsecurity'));
});

test('document reads, downloads, dashboard and writes use tenant scope, not raw pool queries',()=>{
 for(const f of ['documents.ts','dashboard.ts']){
  const s=read('apps/api/src/'+f);
  assert(!s.includes('this.db.query('),f);
  assert(s.includes('this.db.tenantQuery(')||(f==='dashboard.ts'&&s.includes('this.db.transaction(async tx=>{')&&s.includes('await setTenantScope(tx,u.organizationId)')&&s.includes('await requireCurrentCaseRead(tx,u,caseId)')),f);
 }
 const s=read('apps/api/src/documents.ts');
 assert.match(s,/this\.db\.transaction\(async tx=>\{\s*await setTenantScope\(tx,u\.organizationId\);/);
 assert.match(s,/WHERE id=\$1 AND organization_id=\$2/);
 assert(s.includes('this.access.case(')); assert(s.includes('this.access.asset('));
});

test('professional credential submission sets the tenant scope inside its transaction before private document lookup',()=>{
 const s=read('apps/api/src/professional-trust.ts');
 const submit=s.slice(s.indexOf('async submit('),s.indexOf('async withdraw('));
 assert(submit.includes('this.db.transaction(async tx=>{'));
 const tenant=submit.indexOf('await setTenantScope(tx,user.organizationId)');
 const doc=submit.indexOf('SELECT id FROM documents WHERE id=$1');
 assert(tenant>0&&tenant<doc,'tenancy must be established before supporting document is read');
 assert(submit.includes('AND uploaded_by=$3'));
});

test('all direct document SQL references in app src have a reviewed scope boundary',()=>{
 const base=path.join(root,'apps/api/src'),hits=[];
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const p=path.join(dir,e.name);
  if(e.isDirectory())walk(p);
  else if(e.name.endsWith('.ts')&&/\b(?:FROM|INTO|UPDATE|JOIN)\s+(?:public\.)?documents\b/i.test(fs.readFileSync(p,'utf8')))hits.push(path.relative(base,p).replaceAll('\\','/'));
 }}
 walk(base);
 assert.deepEqual(hits.sort(),['dashboard.ts','documents.ts','professional-trust.ts']);
});

test('disposable PostgreSQL contract is fail-closed, tests a non-owner role, cross-org access and rollback',()=>{
 const s=read('tools/e2e-pg-documents-rls-v50.mjs');
 assert(s.indexOf('validateDisposablePgTarget(process.env)')<s.indexOf("await import('pg')"));
 for(const term of ['SET LOCAL ROLE','NOBYPASSRLS','SAVEPOINT forbidden','ROLLBACK TO SAVEPOINT forbidden','FORCE','ROLLBACK',"e.code==='42501'",'documents'])assert(s.includes(term),term);
});

test('CI covers new policy and guarded live contract, with no fail-open markers',()=>{
 const p=JSON.parse(read('package.json')),yaml=read('.github/workflows/ci.yml');
 assert.equal(p.scripts['verify:v50'],'node --test tools/tests-v50/*.test.cjs');
 assert.equal(p.scripts['test:pg:documents-rls:v50'],'node tools/e2e-pg-documents-rls-v50.mjs');
 assert(yaml.includes('npm run verify:v50'));
 assert.match(yaml,/Verify documents tenant RLS on disposable PostgreSQL \(v0\.50\)[\s\S]*?ASSETTRUST_E2E_ALLOW_MUTATION: YES[\s\S]*?npm run test:pg:documents-rls:v50/);
 assert(require('../ci-completeness-v41.cjs').validateCi().ok);
 assert.doesNotMatch(yaml,/continue-on-error:\s*true|\|\|\s*true/);
});

test('operator audit is read-only, includes new documents policy and remaining unprotected tables',()=>{
 const s=read('tools/sql/v50-documents-rls-readonly-audit.sql');
 assert(s.includes('BEGIN TRANSACTION READ ONLY;')&&s.includes('ROLLBACK;'));
 for(const table of ['documents','users','assets','verification_cases','audit_events'])assert(s.includes(`'${table}'`));
 assert.doesNotMatch(s.replace(/^--.*$/gm,''),/\b(?:INSERT|UPDATE|DELETE|ALTER|TRUNCATE|CREATE|DROP)\b/i);
});
