'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto');
const ts=require('../test-typescript-loader.cjs');const root=path.resolve(__dirname,'../..');
function load(rel,imports={}){const file=path.join(root,rel),m={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{module:m,exports:m.exports,require:id=>id==='node:crypto'?crypto:imports[id],Buffer,Date,JSON,Number,Object,Error,process,console},{filename:file,timeout:5000});return m.exports;}
const pol=load('apps/api/src/contexts/report-issuance/domain/report-layout-policy.ts');
const legal=load('apps/api/src/contexts/report-issuance/domain/report-policy.ts');
const att=load('apps/api/src/contexts/report-issuance/domain/signed-attestation.ts',{'./report-policy':legal});
const pdf=load('apps/api/src/contexts/report-issuance/domain/signed-pdf.ts',{'./report-policy':legal,'./signed-attestation':att});
const safe={headerTitle:'EASTERN UGANDA ASSET EVIDENCE',footerNote:'CLIENT CONFIDENTIAL - PRIVATE VERIFICATION',accentHex:'#173A2B'};
const keypair=crypto.generateKeyPairSync('ed25519'),privateKey=keypair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
const trusted={'v38-layout-test':keypair.publicKey.export({format:'der',type:'spki'}).toString('base64')};
const id='a1234567-1234-4234-8234-1234567890ab';
function payload(){const snapshot={reportType:'ASSETTRUST_EVIDENCE_ISSUANCE_V1',legalStatus:legal.REPORT_LEGAL_STATUS,legalNotice:legal.REPORT_NOTICE,organizationName:'Independent Evidence Organization',caseCode:'AT-2026-1',assetCode:'AT-ASSET-1',organizationId:'org-1',evidence:[],summary:'Scope limited to provided evidence'};
 const snapshotSha256=crypto.createHash('sha256').update(legal.canonicalSnapshot(snapshot)).digest('hex');return att.makeBundlePayload({reportId:id,issuedAt:'2026-11-10T00:00:00.000Z',exportedAt:'2026-11-11T00:00:00.000Z',snapshot,snapshotSha256,statusAtExport:'ISSUED'});}
test('valid organization branding is normalized and has a dark, readable contrast',()=>{
 const result=pol.assertReportLayout({...safe,accentHex:'#173a2b'});
 assert.equal(result.accentHex,'#173A2B');assert.equal(result.headerTitle,safe.headerTitle);
 assert.equal(pol.DEFAULT_REPORT_LAYOUT.revision,0);
});
test('untrusted fields, markup, control characters, light colors and false official claims are rejected',()=>{
 for(const candidate of [null,[],{...safe,extra:true},{...safe,headerTitle:'OFFICIAL LAND REGISTRY CERTIFICATE'},
  {...safe,headerTitle:'TRUSTED (x) TITLE'}, {...safe,footerNote:'CLAIM <script>'},
  {...safe,accentHex:'#FFFFFF'}, {...safe,accentHex:'#1122ZZ'}, {...safe,headerTitle:'\n'},
  {...safe,headerTitle:'TRUSTED ORGANIZATION {missing}'}]){
  assert.throws(()=>pol.assertReportLayout(candidate),Error);
 }
});
test('change reason and expected revision must be explicit and bounded',()=>{
 for(const reason of ['', 'too short', 'x'.repeat(501),'<script>unsafe</script>'])assert.throws(()=>pol.assertLayoutReason(reason));
 for(const revision of [-1,1.5,'0',NaN,1e30])assert.throws(()=>pol.assertExpectedLayoutRevision(revision));
 assert.equal(pol.assertLayoutVote('REJECT'),'REJECT');assert.throws(()=>pol.assertLayoutVote('DELETE'));
});
test('approved layout modifies printable branding but never the fixed legal warning or evidence',()=>{
 const p=payload(),layout={...pol.assertReportLayout(safe),revision:3};
 const bytes=pdf.renderPrivateReportPdf(p,layout),defaultBytes=pdf.renderPrivateReportPdf(p);
 assert(!bytes.equals(defaultBytes));
 const temp=require('node:os').tmpdir(),file=path.join(temp,`assettrust-v38-${process.pid}.pdf`);
 try{fs.writeFileSync(file,bytes);const text=cp.execFileSync('pdftotext',[file,'-'],{encoding:'utf8'});
  assert(text.includes('EASTERN UGANDA ASSET EVIDENCE'));
  assert(text.includes('CLIENT CONFIDENTIAL'));
  assert(text.includes('NOT AN OFFICIAL LAND TITLE OR OWNERSHIP CERTIFICATE'));
  assert(text.includes('Scope limited to provided evidence'));
  assert(text.includes('PDF presentation layout revision'));
 }finally{fs.rmSync(file,{force:true})}
 const receipt=pdf.signPdfReceipt(p,bytes,'v38-layout-test',privateKey);
 assert.equal(pdf.verifyPdfReceipt(bytes,receipt,trusted).ok,true);
 const broken=Buffer.from(bytes);broken[120]^=1;assert.throws(()=>pdf.verifyPdfReceipt(broken,receipt,trusted));
});
test('report SQL migration is forward-only and preserves organization FK, immutable approved revisions and one pending change',()=>{
 const s=fs.readFileSync(path.join(root,'apps/api/sql/016_report_pdf_layouts.sql'),'utf8');
 for(const pattern of [/^BEGIN;/,/COMMIT;\s*$/,/FOREIGN KEY\(proposed_by,organization_id\)/,/FOREIGN KEY\(approved_by,organization_id\)/,
  /CREATE UNIQUE INDEX report_pdf_layout_one_pending/,/BEFORE UPDATE OR DELETE ON report_pdf_layout_revisions/,
  /OLD.status <> 'PENDING'/,/NEW.status='PENDING'/,/pdf_layout_active_advance/])assert.match(s,pattern);
 const migrations=require('../migrations/plan.cjs').buildPlan();assert(migrations.some(m=>m.filename==='016_report_pdf_layouts.sql'),'Preserve v0.38 migration when newer migrations are appended');
});
