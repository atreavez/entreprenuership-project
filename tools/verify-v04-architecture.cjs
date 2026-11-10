const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');const root=path.join(__dirname,'..');
const slice=path.join(root,'apps/api/src/contexts/verification');
const list=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?list(path.join(dir,d.name)):[path.join(dir,d.name)]);
const files=list(slice);
test('domain/application cannot import NestJS, SQL libraries, or HTTP adapters',()=>{
 for(const f of files.filter(f=>/\/(domain|application)\//.test(f))){
  const code=fs.readFileSync(f,'utf8');
  assert.doesNotMatch(code,/from ['"](?:@nestjs|pg|express|multer|argon2|react)/,f);
  assert.doesNotMatch(code,/@(Controller|Module|Injectable|Inject|UseGuards)\b/,f);
  assert.doesNotMatch(code,/\b(SELECT|INSERT|UPDATE|DELETE)\s+(\*|FROM|INTO|\w+\s+SET)\b/i,f);
 }
});
test('NestJS persistence adapter implements the port and case routes call the use-case',()=>{
 const adapter=fs.readFileSync(path.join(slice,'infrastructure/postgres-workflow.repository.ts'),'utf8');
 const cases=fs.readFileSync(path.join(root,'apps/api/src/cases.ts'),'utf8');
 assert.match(adapter,/implements WorkflowRepository/);
 assert.match(cases,/this\.workflow\.review\(/);assert.match(cases,/this\.workflow\.advance\(/);
 assert.match(cases,/@Get\(':id\/readiness'\)/);
});
test('confidential case files are not inherited by general asset-grant readers',()=>{
 const access=fs.readFileSync(path.join(root,'apps/api/src/access.ts'),'utf8');
 const docs=fs.readFileSync(path.join(root,'apps/api/src/documents.ts'),'utf8');
 const dashboards=fs.readFileSync(path.join(root,'apps/api/src/dashboard.ts'),'utf8');
 const cases=fs.readFileSync(path.join(root,'apps/api/src/cases.ts'),'utf8');
 assert.match(access,/Asset grants do not confer access/);
 assert.match(docs,/d\.case_id IS NOT NULL AND EXISTS/);
 assert.match(docs,/d\.case_id IS NULL AND EXISTS/);
 assert.match(dashboards,/d\.case_id IS NOT NULL AND EXISTS/);
 assert.doesNotMatch(dashboards,/c\.assigned_to=\$3 OR a\.created_by=\$3/);
 const listSection=cases.slice(cases.indexOf("async list(u:UserAuth)"),cases.indexOf("async get(u:UserAuth"));
 assert.doesNotMatch(listSection,/resource_grants|a\.created_by=\$3/);
});
