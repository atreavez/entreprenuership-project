'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
function load(relative,imports={}){
 const file=path.join(root,relative),m={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module:m,exports:m.exports,require:i=>{if(Object.hasOwn(imports,i))return imports[i];throw Error('Unexpected import '+i)},Object,Date,Error,String,JSON,Number,Map,console},{timeout:5000,filename:file});
 return m.exports;
}
const templates=load('contexts/content-admin/domain/template-policy.ts');
const pub=load('contexts/content-publishing/domain/publication-policy.ts',{'../../content-admin/domain/template-policy':templates});
test('only approved platform keys can be read publicly',()=>{
 assert.equal(pub.assertPublicCopyKey('website.hero_title'),'website.hero_title');
 assert.throws(()=>pub.assertPublicCopyKey('report.summary'));
 assert.throws(()=>pub.assertPublicCopyKey('notification.case_assigned'));
 assert.throws(()=>pub.assertPublicCopyKey('__proto__'));
});
test('published revision overrides default, never a pending proposal',()=>{
 const out=pub.publishText('organization','notification.case_assigned',{body:'Case {{case_reference}} assigned to {{recipient_name}}.',revision:7},{case_reference:'AT-55',recipient_name:'Lilian',organization_name:'Demo'});
 assert.equal(out.text,'Case AT-55 assigned to Lilian.');assert.equal(out.revision,7);assert.equal(out.source,'APPROVED');
 const fallback=pub.publishText('organization','notification.case_assigned',null,{case_reference:'AT-55',recipient_name:'Lilian',organization_name:'Demo'});
 assert.equal(fallback.revision,0);assert.equal(fallback.source,'DEFAULT');
});
test('invalid stored template fails closed and does not leak raw text',()=>{
 assert.throws(()=>pub.publishText('organization','report.summary',{body:'{{unapproved_token}}',revision:1},{asset_reference:'A',case_reference:'C',organization_name:'O'}));
 assert.throws(()=>pub.publishText('organization','report.summary',{body:'Good summary',revision:0},{asset_reference:'A',case_reference:'C',organization_name:'O'}));
 assert.throws(()=>pub.publishText('organization','report.summary',{body:'Summary for {{asset_reference}}',revision:1},{asset_reference:'<secret>',case_reference:'C',organization_name:'O'}));
});
test('report publication is explicitly a draft, never a government certificate',()=>{
 const wording=pub.publishText('organization','report.summary',null,{asset_reference:'A-11',case_reference:'C-9',organization_name:'Kampala Services'});
 const report=pub.attachDraftPublication({reportType:'NON_OFFICIAL_DUE_DILIGENCE_EVIDENCE_SUMMARY',case:{case_code:'C-9'},evidence:[]},wording);
 assert.equal(report.publication.status,'DRAFT');assert.match(report.publication.legalNotice,/government-issued title/);assert.equal(report.publication.templateRevision,0);
 assert.equal(report.reportType,'NON_OFFICIAL_DUE_DILIGENCE_EVIDENCE_SUMMARY');
});
test('private placeholders are never accepted in platform public copy',()=>{
 assert.throws(()=>pub.publishText('platform','website.hero_title',null,{case_reference:'C-SECRET'}));
 assert.equal(pub.publishText('platform','website.hero_title',null,{}).text,'Verify assets with documented evidence');
});
