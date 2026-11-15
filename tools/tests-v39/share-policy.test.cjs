'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('../test-typescript-loader.cjs');const root=path.resolve(__dirname,'../..');
const file=path.join(root,'apps/api/src/contexts/report-sharing/domain/share-policy.ts');const mod={exports:{}};
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>id==='node:crypto'?crypto:undefined,Buffer,Date,Number,Object,Error,process},{filename:file,timeout:5000});const p=mod.exports;
const input={reportId:'a1234567-1234-4234-8234-1234567890ab',recipientLabel:'Legal reviewer A',reason:'Transaction due diligence review is approved for this recipient',expiresHours:24,maxDownloads:2};
test('share creation requires precise bounded input, no extra fields, no control characters',()=>{
 assert.equal(p.assertShareInput(input).maxDownloads,2);
 for(const bad of [{...input,extra:1},{...input,reportId:'x'},{...input,recipientLabel:'<script>'},{...input,reason:'short'},{...input,expiresHours:0},{...input,expiresHours:169},{...input,maxDownloads:0},{...input,maxDownloads:6},{...input,maxDownloads:'1'}])assert.throws(()=>p.assertShareInput(bad));
});
test('two 256-bit independently generated secrets are never interchangeable; malformed credentials fail closed',()=>{
 const {accessToken,accessCode}=p.newShareSecrets();assert.notEqual(accessToken,accessCode);
 const th=p.shareSecretHash('TOKEN',accessToken),ch=p.shareSecretHash('CODE',accessCode);
 assert.equal(accessToken.length,43);assert.equal(accessCode.length,43);assert.equal(th.length,64);
 assert.equal(p.matchShareSecrets(accessToken,accessCode,th,ch),true);
 assert.equal(p.matchShareSecrets(accessCode,accessToken,th,ch),false);
 assert.equal(p.matchShareSecrets(accessToken,accessCode+'x',th,ch),false);
 assert.equal(p.matchShareSecrets(accessToken,'x',th,ch),false);
 assert.notEqual(p.shareSecretHash('TOKEN',accessToken),p.shareSecretHash('CODE',accessToken));
});
test('only unexpired active shares within count bounds may redeem',()=>{
 const base={status:'ACTIVE',expires_at:new Date('2030-01-02T00:00:00Z'),max_downloads:2,download_count:1};const now=new Date('2030-01-01T00:00:00Z');
 assert.equal(p.assertRedeemable(base,now),true);
 for(const change of [{status:'REVOKED'},{status:'PENDING'},{status:'REJECTED'},{expires_at:new Date('2029-12-31')},{download_count:2},{download_count:3},{expires_at:null}])assert.throws(()=>p.assertRedeemable({...base,...change},now));
 assert.throws(()=>p.assertDecision('DELETE'));assert.equal(p.assertDecision('APPROVE'),'APPROVE');
 assert.throws(()=>p.assertRevocationReason('Too short'));assert.match(p.SHARE_NOTICE,/non-official/i);
});
test('new migration is appended to source-checksummed schema and protects tenant grants, state and evidence',()=>{
 const {buildPlan}=require('../migrations/plan.cjs');const plan=buildPlan();assert(plan.some(x=>x.filename==='017_report_recipient_shares.sql'));
 const sql=fs.readFileSync(path.join(root,'apps/api/sql/017_report_recipient_shares.sql'),'utf8');
 for(const re of [/FOREIGN KEY\(report_id,organization_id\)/,/FOREIGN KEY\(proposed_by,organization_id\)/,/FOREIGN KEY\(reviewed_by,organization_id\)/,/reviewed_by<>proposed_by/,/token_sha256 char\(64\)/,/code_sha256 char\(64\)/,/BETWEEN 1 AND 168/,/download_count BETWEEN 0 AND max_downloads/,/BEFORE UPDATE OR DELETE ON report_share_redemptions/,/assettrust_share_transition_guard/])assert.match(sql,re);
 const manifest=fs.readFileSync(path.join(root,'apps/api/src/contexts/platform/domain/schema-manifest.ts'),'utf8');const hash=crypto.createHash('sha256').update(sql).digest('hex');assert(manifest.includes(`filename: '017_report_recipient_shares.sql', sha256: '${hash}'`));
 for(const name of ['report_recipient_shares','report_share_redemptions'])assert(manifest.includes(name));
});
test('public and administrative routes are separated; credentials are not in a GET route',()=>{
 const src=fs.readFileSync(path.join(root,'apps/api/src/contexts/report-sharing/infrastructure/report-sharing.module.ts'),'utf8');
 assert.match(src,/@Controller\('reports\/shares'\)@UseGuards\(AuthGuard\)/);
 assert.match(src,/@Controller\('reports\/recipient'\)/);
 assert.match(src,/@Post\('redeem'\)@Throttle\(/);
 assert(!src.includes("@Get('redeem')"));
 const ui=fs.readFileSync(path.join(root,'apps/web/src/ReportRecipientPage.tsx'),'utf8');assert(ui.includes('credentials:\'omit\''));assert(ui.includes('referrerPolicy:\'no-referrer\''));
});
