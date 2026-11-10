import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForOwnedApiReady} from '../ci-runner-policy.mjs';
const environment={ASSETTRUST_E2E_TARGET_ID:'disposable-v14-owner-abcd',ASSETTRUST_E2E_EXPECT_TARGET:'disposable-v14-owner-abcd'};
function response(status,data){return {ok:status>=200&&status<300,status,json:async()=>data};}
function mockFetch(routes,observed=[]){return async (url)=>{observed.push(url);return routes[url.slice(url.indexOf('/api/v1'))]??response(404,{})};}
test('RED: owned readiness rejects a healthy API with an unexpected marker',async()=>{
 const fetchImpl=mockFetch({'/api/v1/healthz':response(200,{ok:true,service:'assettrust-api',e2eTargetId:'unrelated-process'}),'/api/v1/readyz':response(200,{ok:true,database:'ready',postgis:'ready'})});
 await assert.rejects(waitForOwnedApiReady('http://127.0.0.1:4000',environment,{fetchImpl,attempts:1,pause:async()=>{}}),/marker|identity|instance/i);
});
test('RED: no database probe when the instance identity is wrong',async()=>{
 const visited=[];
 const fetchImpl=mockFetch({'/api/v1/healthz':response(200,{ok:true,service:'assettrust-api',e2eTargetId:'unrelated-process'}),'/api/v1/readyz':response(200,{ok:true,database:'ready',postgis:'ready'})},visited);
 await assert.rejects(waitForOwnedApiReady('http://127.0.0.1:4000',environment,{fetchImpl,attempts:1,pause:async()=>{}}));
 assert.equal(visited.some(x=>x.includes('/readyz')),false);
});
test('RED: owned readiness rejects mismatched environment markers before network',async()=>{
 let calls=0;
 await assert.rejects(waitForOwnedApiReady('http://127.0.0.1:4000',{...environment,ASSETTRUST_E2E_EXPECT_TARGET:'some-other-target'},{fetchImpl:async()=>{calls++;return response(200,{})},attempts:1,pause:async()=>{}}),/marker|identity|instance/i);
 assert.equal(calls,0);
});
test('RED: owned readiness requires confirmed schema and database',async()=>{
 const fetchImpl=mockFetch({'/api/v1/healthz':response(200,{ok:true,service:'assettrust-api',e2eTargetId:environment.ASSETTRUST_E2E_TARGET_ID}),'/api/v1/readyz':response(200,{ok:false,database:'not-ready',postgis:'ready'})});
 await assert.rejects(waitForOwnedApiReady('http://127.0.0.1:4000',environment,{fetchImpl,attempts:1,pause:async()=>{}}),/ready|schema|database/i);
});
test('RED: succeeds only after instance identity and readiness are both confirmed',async()=>{
 const visited=[];
 const fetchImpl=mockFetch({'/api/v1/healthz':response(200,{ok:true,service:'assettrust-api',e2eTargetId:environment.ASSETTRUST_E2E_TARGET_ID}),'/api/v1/readyz':response(200,{ok:true,database:'ready',postgis:'ready'})},visited);
 const result=await waitForOwnedApiReady('http://127.0.0.1:4000',environment,{fetchImpl,attempts:1,pause:async()=>{}});
 assert.equal(result.ok,true);
 assert.deepEqual(visited,['http://127.0.0.1:4000/api/v1/healthz','http://127.0.0.1:4000/api/v1/readyz']);
});
