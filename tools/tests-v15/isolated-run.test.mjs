import test from 'node:test';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {checkEnvironment}=require('../ci-security-preflight.cjs');
import {prepareIsolatedRunEnvironment,assertDisposableCiEnvironment,waitForOwnedApiReady} from '../ci-runner-policy.mjs';
const base=()=>({CI:'true',NODE_ENV:'test',ASSETTRUST_E2E_ALLOW_MUTATION:'YES',ASSETTRUST_E2E_TARGET_ID:'prior-unique-job-marker-0001',ASSETTRUST_E2E_EXPECT_TARGET:'prior-unique-job-marker-0001', DATABASE_URL:'postgres://assettrust:pw@127.0.0.1:5432/assettrust_ci', ASSETTRUST_E2E_URL:'http://127.0.0.1:4000'});
const keyFrom=(byte)=>()=>Buffer.alloc(24,byte);
test('Runner replaces even a correct CI job marker with a unique process-scoped value',()=>{
 const before=base();const prepared=prepareIsolatedRunEnvironment(before,{randomBytesImpl:keyFrom(7)});
 assert.equal(prepared.origin,'http://127.0.0.1:4000');
 assert.notEqual(prepared.env.ASSETTRUST_E2E_TARGET_ID,before.ASSETTRUST_E2E_TARGET_ID);
 assert.equal(prepared.env.ASSETTRUST_E2E_TARGET_ID,prepared.env.ASSETTRUST_E2E_EXPECT_TARGET);
 assert.equal(prepared.env.DATABASE_URL,before.DATABASE_URL);
 assert.equal(before.ASSETTRUST_E2E_TARGET_ID,'prior-unique-job-marker-0001');
 assert.match(prepared.env.ASSETTRUST_E2E_TARGET_ID,/^assettrust-v15-[0-9a-f]{48}$/);
});
test('Separate supervised runs cannot share the same instance marker',()=>{
 const first=prepareIsolatedRunEnvironment(base(),{randomBytesImpl:keyFrom(1)});
 const second=prepareIsolatedRunEnvironment(base(),{randomBytesImpl:keyFrom(2)});
 assert.notEqual(first.env.ASSETTRUST_E2E_TARGET_ID,second.env.ASSETTRUST_E2E_TARGET_ID);
});
test('Incorrect job markers and remote test targets fail before generating marker',()=>{
 let invoked=0;const rand=()=>{invoked++;return Buffer.alloc(24,3)};
 assert.throws(()=>prepareIsolatedRunEnvironment({...base(),ASSETTRUST_E2E_EXPECT_TARGET:'other-marker-00001'},{randomBytesImpl:rand}),/marker/i);
 assert.throws(()=>prepareIsolatedRunEnvironment({...base(),DATABASE_URL:'postgres://db.example.org/assettrust_ci'},{randomBytesImpl:rand}),/local|disposable/i);
 assert.equal(invoked,0);
});
test('Rejects URLs that alter PostgreSQL session options or database location',()=>{
 for(const url of [
  'postgres://assettrust:pw@localhost:5432/assettrust_ci?options=-c%20search_path%3Dother',
  'postgres://assettrust:pw@localhost:5432/assettrust_ci#fragment',
  'postgres://assettrust:pw@localhost:5432/assettrust_ci/other'
 ])assert.throws(()=>assertDisposableCiEnvironment({...base(),DATABASE_URL:url}),/database|local|disposable/i);
});
test('Owned readiness aborts as soon as spawned server exits, not after a timeout',async()=>{
 let called=0;
 await assert.rejects(waitForOwnedApiReady('http://127.0.0.1:4000',base(),{attempts:3,fetchImpl:async()=>{called++;throw Error('not ready')},pause:async()=>{},isChildAlive:()=>false}),/exited|server process/i);
 assert.equal(called,0);
});
test('CI must generate markers dynamically rather than retaining a fixed literal',()=>{
 const ci=readFileSync(resolve('.github/workflows/ci.yml'),'utf8');
 assert.doesNotMatch(ci,/^\s+ASSETTRUST_E2E_TARGET_ID:\s+ci-disposable-/m);
 assert.match(ci,/ASSETTRUST_E2E_TARGET_ID=\$\{?marker/);
});
test('Supervised runner passes the prepared environment to its spawned API and test processes',()=>{
 const source=readFileSync('tools/ci-live-integration.mjs','utf8');
 assert.match(source,/prepareIsolatedRunEnvironment/);
 assert.match(source,/env:runEnvironment/);
});

test('CI preflight requires a real pair of matching instance markers, not two absent values',()=>{
 const key=()=>randomBytes(32).toString('hex');
 const config={CI:'true',NODE_ENV:'test',JWT_SECRET:key(),
 MFA_ENCRYPTION_KEY:key(),LOGIN_ABUSE_PEPPER:key(),
 DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({test:key()}),DOCUMENT_ACTIVE_KEY_ID:'test',
 WEB_ORIGIN:'http://localhost:5173',DATABASE_URL:'postgres://assettrust:pw@localhost:5432/assettrust_ci'};
 const marker='assettrust-v15-valid-marker';
 assert.doesNotThrow(()=>checkEnvironment({...config,
  ASSETTRUST_E2E_TARGET_ID:marker,ASSETTRUST_E2E_EXPECT_TARGET:marker}));
 assert.throws(()=>checkEnvironment(config),/CI test mode or instance identity/);
});

test('Actual local HTTP readiness passes only for matching newly minted instance marker',async()=>{
 const {createServer}=await import('node:http');
 const marker=prepareIsolatedRunEnvironment(base(),{randomBytesImpl:keyFrom(5)}).env;
 const server=createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/v1/healthz')res.end(JSON.stringify({ok:true,service:'assettrust-api',e2eTargetId:marker.ASSETTRUST_E2E_TARGET_ID}));
  else if(req.url==='/api/v1/readyz')res.end(JSON.stringify({ok:true,database:'ready',postgis:'ready'}));
  else{res.statusCode=404;res.end('{}')}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try{
  const port=server.address().port;const origin=`http://127.0.0.1:${port}`;
  assert.equal((await waitForOwnedApiReady(origin,marker,{attempts:1})).database,'ready');
  await assert.rejects(waitForOwnedApiReady(origin,{...marker,ASSETTRUST_E2E_TARGET_ID:'outdated-marker-123456',ASSETTRUST_E2E_EXPECT_TARGET:'outdated-marker-123456'},{attempts:1}),/identity|marker/i);
 }finally{const done=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await done}
});

test('Live HTTP test mode binds API to loopback only',()=>{
 const ts=require('typescript');
 const filename=resolve('apps/api/src/contexts/platform/domain/runtime-config.ts');
 const js=ts.transpileModule(readFileSync(filename,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const compiled={exports:{}};
 new Function('exports','require','module',js)(
  compiled.exports,require,compiled
 );
 const {apiListenHost}=compiled.exports;
 for(const host of [undefined,'127.0.0.1','localhost','0.0.0.0','::']){
  assert.equal(apiListenHost({NODE_ENV:'test',API_BIND_HOST:host}),'127.0.0.1');
 }
 const source=readFileSync('apps/api/src/main.ts','utf8');
 assert.match(source,/const\s+host\s*=\s*apiListenHost\(process\.env\)/);
 assert.match(source,/await\s+app\.listen\(port,\s*host\)/);
});
