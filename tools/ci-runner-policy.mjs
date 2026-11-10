import {randomBytes} from 'node:crypto';
/** Pure CI integration-runner policy: never run mutation tests against production. */
const isLoopback = host => ['localhost','127.0.0.1','[::1]','::1'].includes(host);
export function assertDisposableCiEnvironment(env) {
 if (env.CI !== 'true' || env.NODE_ENV !== 'test') throw Error('Live integration runner requires explicit CI test mode');
 if (env.ASSETTRUST_E2E_ALLOW_MUTATION !== 'YES') throw Error('Mutation tests are not enabled');
 const target = env.ASSETTRUST_E2E_TARGET_ID;
 if (!target || target.length < 12 || target !== env.ASSETTRUST_E2E_EXPECT_TARGET)
  throw Error('Disposable test marker missing or inconsistent');
 let database,base;
 try { database=new URL(env.DATABASE_URL); base=new URL(env.ASSETTRUST_E2E_URL||'http://127.0.0.1:4000'); }
 catch { throw Error('A valid local database and API URL are required'); }
 if (!['postgres:','postgresql:'].includes(database.protocol) || !isLoopback(database.hostname) ||
     !/^\/assettrust(?:_ci|_test)$/.test(database.pathname) || database.search || database.hash)
  throw Error('Live CI database must be disposable, local, and named assettrust_ci or assettrust_test');
 if (base.protocol !== 'http:' || !isLoopback(base.hostname) || base.pathname !== '/' ||
     base.search || base.hash || base.username || base.password)
  throw Error('Live CI API must be a bare localhost HTTP origin');
 return base.origin;
}
/**
 * An individual CI job may have a marker, but only the child server started by
 * this supervisor receives the unpredictable *run-scoped* marker. Never reuse
 * the job marker for HTTP ownership checks; old API processes may retain it.
 * The caller must keep the new environment private and pass it to both the
 * spawned API and its test children.
 */
export function prepareIsolatedRunEnvironment(env, {randomBytesImpl=randomBytes}={}) {
 const origin=assertDisposableCiEnvironment(env); // Check safety before generating credentials.
 const entropy=randomBytesImpl(24);
 if(!Buffer.isBuffer(entropy) || entropy.length!==24) throw Error('Runner entropy source must supply 24 bytes');
 const marker='assettrust-v15-'+entropy.toString('hex');
 const runEnvironment={...env,ASSETTRUST_E2E_TARGET_ID:marker,ASSETTRUST_E2E_EXPECT_TARGET:marker};
 assertDisposableCiEnvironment(runEnvironment);
 return {origin,env:runEnvironment};
}

export async function waitForApiReady(origin,{fetchImpl=fetch,attempts=45,pause=ms=>new Promise(r=>setTimeout(r,ms)),intervalMs=2000}={}) {
 for (let n=0;n<attempts;n++) {
  try {
   const response=await fetchImpl(origin+'/api/v1/readyz',{signal:AbortSignal.timeout(2500)});
   if (response.ok) {
    const result=await response.json();
    if (result.ok===true && result.database==='ready' && result.postgis==='ready') return result;
   }
  }catch{/* API booting, retries are bounded */}
  if(n<attempts-1)await pause(intervalMs);
 }
 throw Error('API readiness never passed the database and PostGIS checks');
}

/**
 * Identity-bound readiness for the supervised, disposable integration runner.
 * A READY response alone does not establish ownership of the local API port:
 * another developer process may already be listening on that port.
 * Keep health/identity check BEFORE readiness, then return only on both passes.
 */
export async function waitForOwnedApiReady(origin,env,{
 fetchImpl=fetch,attempts=45,pause=ms=>new Promise(r=>setTimeout(r,ms)),intervalMs=2000,
 isChildAlive=()=>true
}={}){
 const expected=env.ASSETTRUST_E2E_EXPECT_TARGET;
 if(typeof expected!=='string'||expected.length<12||expected!==env.ASSETTRUST_E2E_TARGET_ID)
  throw Error('Integration instance marker is missing or inconsistent');
 for(let i=0;i<attempts;i++){
  if(!isChildAlive())throw Error('Supervised API server process exited before readiness');
  try{
   const health=await fetchImpl(origin+'/api/v1/healthz',{signal:AbortSignal.timeout(2500)});
   if(health.ok){
    const identity=await health.json();
    // Distinct from a booting API. A different responding service is a hard stop.
    if(identity?.service!=='assettrust-api'||identity?.e2eTargetId!==expected)
      throw Object.assign(new Error('Integration instance identity marker mismatch; refusing to run tests'),{fatal:true});
    const ready=await fetchImpl(origin+'/api/v1/readyz',{signal:AbortSignal.timeout(2500)});
    if(ready.ok){
      const state=await ready.json();
      if(state?.ok===true&&state?.database==='ready'&&state?.postgis==='ready')return state;
    }
   }
  }catch(error){if(error?.fatal)throw error;}
  if(i<attempts-1)await pause(intervalMs);
 }
 throw Error('Owned API instance never became database/PostGIS ready');
}
