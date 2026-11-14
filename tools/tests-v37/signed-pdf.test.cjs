'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');const root=path.resolve(__dirname,'../..');
const source=path.join(root,'apps/api/src/contexts/report-issuance/domain');
function load(file,imports={}){
 const p=path.join(source,file),mod={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(p,'utf8'),{fileName:p,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>id==='node:crypto'?crypto:imports[id],Buffer,Date,JSON,Number,Map,Set,Object,Error,console},{filename:p,timeout:5000});return mod.exports;
}
const policy=load('report-policy.ts');const att=load('signed-attestation.ts',{'./report-policy':policy});
const pdfDomain=load('signed-pdf.ts',{'./report-policy':policy,'./signed-attestation':att});
const pair=crypto.generateKeyPairSync('ed25519'),other=crypto.generateKeyPairSync('ed25519');
const privateKey=pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
const trust={'local-key-1':pair.publicKey.export({format:'der',type:'spki'}).toString('base64')};
const id='a1234567-1234-4234-8234-1234567890ab';
function sample(status='ISSUED',extra={}){
 const snapshot={reportType:'ASSETTRUST_EVIDENCE_ISSUANCE_V1',legalStatus:policy.REPORT_LEGAL_STATUS,legalNotice:policy.REPORT_NOTICE,caseId:'private-case',caseCode:'CASE-0007',assetCode:'ASSET-42',organizationName:'Local Verification Office',organizationId:'private-org',summary:'Independent checks reflect the provided evidence only. Not a proof of ownership.',evidence:[{stage:'LEGAL_REVIEW',type:'LEGAL_OPINION',sourceName:'Example (External)',reference:'TEST-REF-1',observations:'Test notes, read only. The user (buyer) must verify official records.',recordedBy:'reviewer-1',reviewedBy:'reviewer-2'}],...extra};
 const snapshotSha256=crypto.createHash('sha256').update(policy.canonicalSnapshot(snapshot)).digest('hex');
 return att.makeBundlePayload({reportId:id,issuedAt:'2026-11-10T00:00:00.000Z',exportedAt:'2026-11-11T00:00:00.000Z',snapshot,snapshotSha256,statusAtExport:status});
}
function make(status='ISSUED',extra={}){const p=sample(status,extra),pdf=pdfDomain.renderPrivateReportPdf(p),receipt=pdfDomain.signPdfReceipt(p,pdf,'local-key-1',privateKey);return {pdf,receipt};}
test('A4 PDF renders complete case and evidence details with legal warning',()=>{
 const {pdf}=make();assert(pdf.subarray(0,8).toString()==='%PDF-1.4');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v37-pdf-'));
 try{const file=path.join(dir,'proof.pdf');fs.writeFileSync(file,pdf);const info=cp.execFileSync('pdfinfo',[file],{encoding:'utf8'});assert.match(info,/Page size:\s+595/);
  const text=cp.execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});
  for(const v of ['NOT AN OFFICIAL','Local Verification Office','CASE-0007','ASSET-42','TEST-REF-1','independent','LEGAL_REVIEW','CONFIDENTIAL'])assert(text.toLowerCase().includes(v.toLowerCase()),v);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Ed25519 detached receipt verifies exact PDF bytes and rejects altered PDF, status and untrusted key',()=>{
 const {pdf,receipt}=make('WITHDRAWN');
 const verified=pdfDomain.verifyPdfReceipt(pdf,receipt,trust);assert.equal(verified.reportId,id);assert.equal(verified.statusAtExport,'WITHDRAWN');
 const changed=Buffer.from(pdf);changed[changed.length-25]^=1;assert.throws(()=>pdfDomain.verifyPdfReceipt(changed,receipt,trust));
 const forgery=structuredClone(receipt);forgery.payload.statusAtExport='ISSUED';assert.throws(()=>pdfDomain.verifyPdfReceipt(pdf,forgery,trust));
 assert.throws(()=>pdfDomain.verifyPdfReceipt(pdf,receipt,{}));
 assert.throws(()=>pdfDomain.verifyPdfReceipt(pdf,receipt,{'local-key-1':other.publicKey.export({format:'der',type:'spki'}).toString('base64')}));
});
test('independent CLI accepts verified bytes and rejects modified bytes, keys and signed metadata',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-cli-v37-'));
 try{
  const {pdf,receipt}=make();const pdfPath=path.join(dir,'r.pdf'),proof=path.join(dir,'r.receipt.json'),keys=path.join(dir,'trusted.json');
  fs.writeFileSync(pdfPath,pdf);fs.writeFileSync(proof,JSON.stringify(receipt));fs.writeFileSync(keys,JSON.stringify(trust));
  const cmd=path.join(root,'tools/verify-report-pdf-v37.cjs');
  assert.match(cp.execFileSync(process.execPath,[cmd,pdfPath,proof,keys],{encoding:'utf8'}),/PDF SIGNATURE RECEIPT VALID/);
  const x=Buffer.from(pdf);x[30]^=4;fs.writeFileSync(pdfPath,x);
  assert.equal(cp.spawnSync(process.execPath,[cmd,pdfPath,proof,keys],{encoding:'utf8'}).status,1);
  fs.writeFileSync(pdfPath,pdf);fs.writeFileSync(keys,'{}');assert.equal(cp.spawnSync(process.execPath,[cmd,pdfPath,proof,keys],{encoding:'utf8'}).status,1);
  fs.writeFileSync(keys,JSON.stringify(trust));receipt.payload.pdfSha256='0'.repeat(64);fs.writeFileSync(proof,JSON.stringify(receipt));assert.equal(cp.spawnSync(process.execPath,[cmd,pdfPath,proof,keys],{encoding:'utf8'}).status,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('PDF escapes malicious input and preserves multipage evidence, showing stale-status warning',()=>{
 const attacks='\\(x) /JS /JavaScript <script>alert(1)</script>\\';
 const evidence=Array.from({length:50},(_,i)=>({stage:'LEGAL_REVIEW',type:'LEGAL_OPINION',sourceName:'(source)',reference:`PAGE-${i}`,observations:attacks+' Long text '.repeat(20),recordedBy:'one',reviewedBy:'two'}));
 const {pdf}=make('UNDER_REVIEW',{evidence,summary:attacks});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v37-escape-'));
 try{const file=path.join(dir,'r.pdf');fs.writeFileSync(file,pdf);const info=cp.execFileSync('pdfinfo',[file],{encoding:'utf8'});
  assert(Number(info.match(/^Pages:\s*(\d+)/m)?.[1]||0)>=3);
  const txt=cp.execFileSync('pdftotext',[file,'-'],{encoding:'utf8'});assert(txt.includes('PAGE-0'));assert(txt.includes('PAGE-49'));assert(txt.includes('UNDER_REVIEW'));
  assert(!pdf.toString('ascii').includes('/OpenAction '));assert(!pdf.toString('ascii').includes('/AA '));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('routes require current admin step-up, org isolation, hash integrity, signing and auditing; UI downloads two artifacts',()=>{
 const api=fs.readFileSync(path.join(root,'apps/api/src/contexts/report-issuance/infrastructure/report-issuance.module.ts'),'utf8');
 const part=api.split('async pdfExport(')[1].split('async privateReport(')[0];
 assert.match(part,/assertCurrentAdminStepUp\(tx,actor,sid\)/);assert.match(part,/r\.organization_id=\$2/);
 assert.match(part,/sha\(canonicalSnapshot\(r.snapshot\)\)!==r.snapshot_sha256/);
 assert.match(part,/this\.audit\.write/);assert.match(part,/REPORT_PDF_EXPORTED/);
 assert.match(api,/@Get\(':id\/pdf-export'\)/);assert.match(api,/@Header\('Cache-Control','private, no-store'\)pdfExport/);
 const ui=fs.readFileSync(path.join(root,'apps/web/src/ReportIssuancePage.tsx'),'utf8');assert.match(ui,/exportSignedPdf/);assert.match(ui,/receipt\.json/);assert.match(ui,/application\/pdf/);
});
