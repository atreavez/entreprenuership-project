import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDisposableCiEnvironment, waitForApiReady} from '../ci-runner-policy.mjs';
const clean = () => ({
 CI:'true', NODE_ENV:'test', ASSETTRUST_E2E_ALLOW_MUTATION:'YES',
 ASSETTRUST_E2E_TARGET_ID:'assettrust-disposable-test-2026',
 ASSETTRUST_E2E_EXPECT_TARGET:'assettrust-disposable-test-2026',
 DATABASE_URL:'postgres://assettrust:example@127.0.0.1:5432/assettrust_ci',
 ASSETTRUST_E2E_URL:'http://127.0.0.1:4000',
});
test('only explicit disposable CI environment is accepted', () => assert.equal(assertDisposableCiEnvironment(clean()), 'http://127.0.0.1:4000'));
for (const [name,mutations] of Object.entries({
 production:{NODE_ENV:'production'},
 nonCI:{CI:'false'},
 noApproval:{ASSETTRUST_E2E_ALLOW_MUTATION:'NO'},
 mismatchedMarker:{ASSETTRUST_E2E_EXPECT_TARGET:'different-disposable-marker'},
 publicDatabase:{DATABASE_URL:'postgres://assettrust:pw@company-db.example:5432/prod'},
 forbiddenDatabase:{DATABASE_URL:'postgres://assettrust:pw@127.0.0.1:5432/postgres'},
 publicAPI:{ASSETTRUST_E2E_URL:'https://assettrust.example.org'},
 foreignLocalHost:{ASSETTRUST_E2E_URL:'http://user:secret@localhost:4000'},
})) test(`rejects ${name}`,()=>assert.throws(()=>assertDisposableCiEnvironment({...clean(),...mutations})));

test('readiness polling resolves after temporary 503s without bypassing schema checks',async()=>{
 let count=0;
 const fetchImpl=async()=>{count++;return {ok:count===3,json:async()=>({ok:count===3,database:'ready',postgis:'ready'})}};
 await waitForApiReady('http://127.0.0.1:4000',{fetchImpl,attempts:3,pause:async()=>{}});
 assert.equal(count,3);
});

test('readiness polling rejects false-ready responses and times out',async()=>{
 const fake=async()=>({ok:true,json:async()=>({ok:true,database:'unready'})});
 await assert.rejects(waitForApiReady('http://127.0.0.1:4000',{fetchImpl:fake,attempts:2,pause:async()=>{}}),/readiness/);
});
