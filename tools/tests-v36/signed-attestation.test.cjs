'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..');
const source=path.join(root,'apps/api/src/contexts/report-issuance/domain');
function load(file,imports={}){
 const p=path.join(source,file),mod={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(p,'utf8'),{fileName:p,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const vm=require('node:vm');vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>id==='node:crypto'?crypto:imports[id],Buffer,Date,JSON,Number,Map,Set,Object,Error,console},{filename:p,timeout:5000});
 return mod.exports;
}
const policy=load('report-policy.ts'),domain=load('signed-attestation.ts',{'./report-policy':policy});
const id='a1234567-1234-4234-8234-1234567890ab';
function sample(status='ISSUED'){
 const snapshot={reportType:'ASSETTRUST_EVIDENCE_ISSUANCE_V1',legalStatus:policy.REPORT_LEGAL_STATUS,legalNotice:policy.REPORT_NOTICE,caseId:'private-case',organizationId:'private-org',summary:'All independently reviewed evidence is limited in scope',evidence:[]};
 const snapshotSha256=crypto.createHash('sha256').update(policy.canonicalSnapshot(snapshot)).digest('hex');
 return domain.makeBundlePayload({reportId:id,issuedAt:'2026-11-10T00:00:00.000Z',exportedAt:'2026-11-11T00:00:00.000Z',snapshot,snapshotSha256,statusAtExport:status});
}
const pair=crypto.generateKeyPairSync('ed25519'),other=crypto.generateKeyPairSync('ed25519');
const privateB64=pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
const publicB64=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
const trust={'local-key-1':publicB64};
const sign=x=>domain.signBundle(x,'local-key-1',privateB64);
test('real Ed25519 signature verifies against independently trusted public key and deterministic SHA-256 snapshot',()=>{
 const bundle=sign(sample());const x=domain.verifyBundle(bundle,trust);
 assert.equal(x.reportId,id);assert.equal(x.statusAtExport,'ISSUED');
 assert.equal(domain.publicKeyDescription('local-key-1',privateB64).spkiDerBase64,publicB64);
});
test('tampering with report evidence, public verification path, timestamps or current status fails closed',()=>{
 const valid=sign(sample());
 for(const change of [b=>b.payload.snapshot.summary='Altered facts',b=>b.payload.statusAtExport='WITHDRAWN',b=>b.payload.issuedAt='2025-01-01T00:00:00.000Z',b=>b.payload.verificationPath='/external',b=>b.payload.notice='Official ownership certificate']){
  const clone=structuredClone(valid);change(clone);assert.throws(()=>domain.verifyBundle(clone,trust));
 }
});
test('self-signed attacker key is rejected without external trust; wrong algorithm rejected',()=>{
 const bundle=sign(sample());assert.throws(()=>domain.verifyBundle(bundle,{'local-key-1':other.publicKey.export({format:'der',type:'spki'}).toString('base64')}));
 assert.throws(()=>domain.verifyBundle(bundle,{}));assert.throws(()=>domain.verifyBundle({...bundle,algorithm:'RSA'},trust));
 assert.throws(()=>domain.verifyBundle({...bundle,signatureBase64:'A'.repeat(88)},trust));
});
test('withdrawn and superseded reports remain signed historical evidence with recheck warning',()=>{
 for(const status of ['WITHDRAWN','UNDER_REVIEW','SUPERSEDED']){const b=sign(sample(status));assert.equal(domain.verifyBundle(b,trust).statusAtExport,status);assert.match(b.payload.statusNotice,/recheck/i)}
});
test('offline CLI validates good signature and refuses tampered bundle and unpinned public key',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v36-test-'));
 try{
  const file=path.join(dir,'signed.json'),keys=path.join(dir,'pinned.json'),cmd=path.join(root,'tools/verify-report-bundle-v36.cjs');
  const data=sign(sample());fs.writeFileSync(file,JSON.stringify(data));fs.writeFileSync(keys,JSON.stringify(trust));
  assert.match(cp.execFileSync(process.execPath,[cmd,file,keys],{encoding:'utf8'}),/SIGNATURE VALID/);
  data.payload.snapshot.summary='forged';fs.writeFileSync(file,JSON.stringify(data));
  const x=cp.spawnSync(process.execPath,[cmd,file,keys],{encoding:'utf8'});assert.equal(x.status,1);assert.match(x.stderr,/VERIFICATION FAILED/);
  fs.writeFileSync(file,JSON.stringify(sign(sample())));fs.writeFileSync(keys,'{}');
  assert.equal(cp.spawnSync(process.execPath,[cmd,file,keys],{encoding:'utf8'}).status,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('key generator produces a private file with restricted permissions; no private bytes in stdout',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-keys-v36-'));
 try{
  const cmd=path.join(root,'tools/generate-report-key-v36.cjs');const output=cp.execFileSync(process.execPath,[cmd,'--out',temp,'--key-id','local-key-2026'],{encoding:'utf8'});
  const privatePath=path.join(temp,'private-report-key-local-key-2026.txt'),publicPath=path.join(temp,'trusted-report-public-keys-local-key-2026.json');
  const value=fs.readFileSync(privatePath,'utf8').trim();assert.equal(fs.statSync(privatePath).mode&0o777,0o600);assert(!output.includes(value));
  const description=domain.publicKeyDescription('local-key-2026',value);
  assert.equal(JSON.parse(fs.readFileSync(publicPath,'utf8'))['local-key-2026'],description.spkiDerBase64);
  assert.equal(cp.spawnSync(process.execPath,[cmd,'--out',temp,'--key-id','local-key-2026'],{encoding:'utf8'}).status!==0,true);
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
test('service and UI routes maintain tenant-scoped MFA and avoid public report-evidence exposure',()=>{
 const api=fs.readFileSync(path.join(root,'apps/api/src/contexts/report-issuance/infrastructure/report-issuance.module.ts'),'utf8');
 assert.match(api,/async signedExport\(actor:UserAuth,sid:string,idInput:string\)/);
 const method=api.split('async signedExport(')[1].split('async privateReport(')[0];
 assert.match(method,/assertCurrentAdminStepUp\(tx,actor,sid\)/);
 assert.match(method,/r\.organization_id=\$2/);assert.match(method,/this\.audit\.write/);assert.match(method,/REPORT_SIGNED_BUNDLE_EXPORTED/);
 assert.match(api,/@Get\(':id\/signed-export'\)/);assert.match(api,/@Get\('verify\/signing-key'\)/);
 const web=fs.readFileSync(path.join(root,'apps/web/src/ReportIssuancePage.tsx'),'utf8');assert.match(web,/exportSignedBundle/);assert.match(web,/signed-export/);
});
