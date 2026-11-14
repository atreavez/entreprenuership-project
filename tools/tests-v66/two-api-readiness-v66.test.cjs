'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const http=require('node:http');const {spawnSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const tool=require('../two-api-readiness-v66.cjs');const root=path.resolve(__dirname,'../..');
const a='v66-fixture-owned-marker-a';const b='v66-fixture-owned-marker-b';
function env(ports){return {CI:'true',NODE_ENV:'test',ASSETTRUST_V66_HTTP_CONFIRM:'YES',ASSETTRUST_V66_HTTP_PORTS:ports.join(','),ASSETTRUST_V66_EXPECT_TARGETS:a+','+b};}
async function start(marker,{drift=false,wrongVersion=false,redirect=false}={}){
 const expected=tool.expected();
 const server=http.createServer((req,res)=>{
  if(redirect){res.writeHead(302,{location:'https://example.com/private'});res.end();return;}
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  if(req.url==='/api/v1/healthz')return res.end(JSON.stringify({ok:true,service:'assettrust-api',version:wrongVersion?'0.01.0':expected.version,e2eTargetId:marker}));
  if(req.url==='/api/v1/readyz')return res.end(JSON.stringify({ok:true,database:'ready',postgis:'ready',schema:'verified-migration-ledger',security:drift?'drifted':'rls-policy-contract-verified',version:expected.version,migrationsVerified:expected.migrations,rlsPoliciesVerified:expected.policies,protectedTablesVerified:expected.tables}));
  res.statusCode=404;res.end('{}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,port:server.address().port};
}
async function withServers(config,fn){
 const servers=await Promise.all([start(a,config[0]),start(b,config[1])]);
 try{return await fn(servers);}finally{await Promise.all(servers.map(({server})=>new Promise(resolve=>server.close(resolve))));}
}
test('the two-API gate rejects default/missing permissions without issuing requests',async()=>{
 let count=0;
 await assert.rejects(tool.check({},()=>{count++;}),/NOT_AUTHORIZED_FOR_LOCAL_TEST/);assert.equal(count,0);
});
test('exactly two distinct safe loopback ports required',()=>{
 for(const x of ['80,443','4000,4000','4000,abcd','4000,4001,4002','4000,65536','https://external:4000,4001'])assert.throws(()=>tool.parsePorts(x));
 assert.deepEqual(tool.parsePorts('4000,4001'),[4000,4001]);
});
test('unguessable distinct markers are required before network calls',()=>{
 for(const x of ['abc,def','aaaaaaaaaaaaaaaa,aaaaaaaaaaaaaaaa','aaaaaaaaaaaaaaaa','aaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbb,cccccccccccccccc'])assert.throws(()=>tool.parseMarkers(x));
});
test('proxy environment is explicitly rejected for deterministic loopback test',()=>{
 assert.throws(()=>tool.validate({...env([4000,4001]),HTTPS_PROXY:'http://external.invalid:8080'}),/PROXY_ENV_NOT_ALLOWED/);
});
test('local source versions and migration/policy inventory are derived, not invented',()=>{
 const c=tool.expected();assert.match(c.version,/^0\.\d+\.0$/);assert.equal(c.migrations,27);assert.equal(c.policies,16);assert.equal(c.tables,13);
});
test('two distinct local actual HTTP servers with matching markers are accepted as LOCAL-only',async()=>{
 await withServers([{},{}],async servers=>{
  const r=await tool.check(env(servers.map(x=>x.port)));
  assert.equal(r.status,'LOCAL_READINESS_PASSED_RELEASE_BLOCKED');assert.equal(r.productionApproved,false);
  assert.equal(r.livePostgresTestsVerified,false);
  assert(r.instances.every(x=>x.ready&&x.owned));
  assert(!JSON.stringify(r).includes(a));assert(!JSON.stringify(r).includes(b));
 });
});
test('single server security drift blocks both-server acceptance',async()=>{
 await withServers([{}, {drift:true}],async servers=>{
  const r=await tool.check(env(servers.map(x=>x.port)));
  assert.equal(r.status,'FAILED');assert.equal(r.instances[0].ready,true);assert.equal(r.instances[1].ready,false);
  assert(r.issues.includes('API_2_READINESS_CONTRACT_MISMATCH'));
 });
});
test('wrong target marker fails BEFORE calling readiness',async()=>{
 await withServers([{},{}],async servers=>{
  const e=env(servers.map(x=>x.port));e.ASSETTRUST_V66_EXPECT_TARGETS=a+',v66-wrong-marker-test';
  const r=await tool.check(e);assert.equal(r.status,'FAILED');assert.equal(r.instances[1].owned,false);
  assert(r.issues.includes('API_2_TARGET_IDENTITY_MISMATCH'));
 });
});
test('old-version API is rejected during rolling deployment acceptance',async()=>{
 await withServers([{wrongVersion:true},{}],async servers=>{
  const r=await tool.check(env(servers.map(x=>x.port)));assert.equal(r.status,'FAILED');assert.equal(r.instances[0].ready,false);
 });
});
test('redirect attempts cannot cause HTTP probe to follow outside loopback',async()=>{
 await withServers([{redirect:true},{}],async servers=>{
  const r=await tool.check(env(servers.map(x=>x.port)));assert.equal(r.status,'FAILED');assert(r.issues.includes('API_1_CONNECTION_OR_TIMEOUT'));
 });
});
test('only static codes appear for unavailable HTTP ports',async()=>{
 const r=await tool.check(env([64001,64002]));assert.equal(r.status,'FAILED');assert.equal(r.issues.length,2);
 assert(!JSON.stringify(r).includes('https://'));assert(!JSON.stringify(r).includes(a));
});
test('CLI plan does not contact network and does not mention approval',()=>{
 const r=tool.plan();assert.equal(r.productionApproved,false);assert.match(r.scope,/No redirects/);
});
test('CLI check rejects missing confirmation with safe error message',()=>{
 const p=spawnSync(process.execPath,['tools/two-api-readiness-v66.cjs','--check'],{cwd:root,env:{PATH:process.env.PATH},encoding:'utf8',timeout:4000});
 assert.notEqual(p.status,0);assert.match(p.stderr,/NOT_AUTHORIZED_FOR_LOCAL_TEST/);
});
test('CI definition places installed-dependency v66 suite after npm ci',()=>{
 const ci=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
 assert(ci.indexOf('npm run verify:v66')>ci.indexOf('run: npm ci'));
 const scripts=require(path.join(root,'package.json')).scripts;
 assert(scripts['verify:v66']);assert(scripts['readiness:two-api:plan:v66']);assert(scripts['readiness:two-api:check:v66']);
});
