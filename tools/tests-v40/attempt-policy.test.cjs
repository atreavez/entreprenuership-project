'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');const root=path.resolve(__dirname,'../..');
const file=path.join(root,'apps/api/src/contexts/report-sharing/domain/attempt-policy.ts');
function load(){const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(js,{module:m,exports:m.exports,require:()=>undefined,Date,Number,Error},{filename:file});return m.exports}
test('failure window policy limits repeated attempts and resets at the correct boundary',()=>{
 const p=load(),now=new Date('2026-11-11T00:00:00Z');
 assert.equal(p.WINDOW_MINUTES,15);assert.equal(p.MAX_FAILURES,10);assert.equal(p.ALERT_FAILURES,5);
 assert.equal(p.attemptBlocked(null,now),false);
 assert.equal(p.attemptBlocked({failed_count:9,window_started_at:now},now),false);
 assert.equal(p.attemptBlocked({failed_count:10,window_started_at:now},now),true);
 assert.equal(p.attemptBlocked({failed_count:10,window_started_at:new Date('2026-11-10T23:44:59Z')},now),false);
 assert.equal(p.attemptBlocked({failed_count:10,window_started_at:new Date('2026-11-10T23:45:00Z')},now),false);
 assert.equal(p.attemptBlocked({failed_count:10,window_started_at:new Date('2026-11-10T23:45:01Z')},now),true);
 assert.equal(p.attemptBlocked({failed_count:Infinity,window_started_at:now},now),true);
});
test('forward-only migration defines cross-tenant foreign key, bounded counters and no secret storage',()=>{
 const {buildPlan}=require('../migrations/plan.cjs');const plan=buildPlan();assert.equal(plan[17].filename,'018_recipient_attempt_windows.sql');
 const src=fs.readFileSync(path.join(root,'apps/api/sql/018_recipient_attempt_windows.sql'),'utf8');
 for(const re of [/CREATE TABLE report_share_access_windows/,/FOREIGN KEY \(share_id,organization_id\)/,/REFERENCES report_recipient_shares/,/failed_count BETWEEN 0 AND 10/,/CREATE TRIGGER/,/BEFORE UPDATE OR DELETE/])assert.match(src,re);
 assert.doesNotMatch(src,/access_token|access_code|ip_address|raw_secret/i);
 const {createHash}=require('node:crypto');const manifest=fs.readFileSync(path.join(root,'apps/api/src/contexts/platform/domain/schema-manifest.ts'),'utf8');const hash=createHash('sha256').update(src).digest('hex');assert(manifest.includes(`filename: '018_recipient_attempt_windows.sql', sha256: '${hash}'`));
 assert(manifest.includes("'report_share_access_windows'"));
});
