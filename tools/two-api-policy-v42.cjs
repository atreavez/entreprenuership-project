'use strict';
/** Dependency-free, fail-closed policy for v0.42 supervised two-real-API smoke.
 * This does NOT establish cross-node credential counter correctness or identity verification.
 */
const {randomUUID,randomBytes}=require('node:crypto');
const loopback=new Set(['localhost','127.0.0.1','[::1]']);
function parsePort(input,fallback){
 if(input===undefined||input==='')return fallback;
 if(typeof input!=='string'||!(/^[1-9][0-9]{3,4}$/).test(input))throw Error('Unsafe or malformed two-API port');
 const value=Number(input);
 if(!Number.isSafeInteger(value)||value<1024||value>65535)throw Error('Two-API port out of range');
 return value;
}
function assertTwoApiEnvironment(env){
 if(env.CI!=='true'||env.NODE_ENV!=='test')throw Error('Two-API contract requires CI=true and NODE_ENV=test');
 if(env.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES'||env.ASSETTRUST_V42_TWO_API_CONTRACT!=='YES')throw Error('Two-API contract requires explicit disposable authorization');
 const marker=env.ASSETTRUST_E2E_TARGET_ID;
 if(typeof marker!=='string'||marker.length<12||marker!==env.ASSETTRUST_E2E_EXPECT_TARGET)throw Error('Missing or mismatched test ownership marker');
 let db,api;
 try{db=new URL(env.DATABASE_URL);api=new URL(env.ASSETTRUST_E2E_URL)}catch{throw Error('Valid test URLs required')}
 if(!['postgres:','postgresql:'].includes(db.protocol)||!loopback.has(db.hostname)||
    !['/assettrust_ci','/assettrust_test'].includes(db.pathname)||db.search||db.hash)
  throw Error('Two-API database must be exact disposable loopback assettrust_ci or assettrust_test');
 if(api.protocol!=='http:'||!loopback.has(api.hostname)||api.pathname!=='/'||api.search||api.hash||api.username||api.password)
  throw Error('Two-API contract requires a bare local HTTP origin');
 const ports=[parsePort(env.ASSETTRUST_V42_API_PORT_A,4101),parsePort(env.ASSETTRUST_V42_API_PORT_B,4102)];
 if(ports[0]===ports[1])throw Error('Two-API process ports must differ');
 return {ports,dbName:db.pathname.slice(1)};
}
function recipientProbe(origin,shareId=randomUUID()){
 if(!/^https?:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin))throw Error('Only owned test-loopback origin is allowed');
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(shareId))throw Error('Invalid test share ID');
 return {url:origin+'/api/v1/reports/recipient/redeem',options:{method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({shareId,accessToken:randomBytes(32).toString('hex'),accessCode:randomBytes(32).toString('hex')})}};
}
function assertDeniedResponse(response){
 if(response?.status!==404)throw Error('Unknown test share must be rejected as HTTP 404; a success, 429 or 5xx is a failed smoke contract');
 if(!(/(?:^|[,\s])no-store(?:$|[,\s])/i).test(response?.headers?.get('cache-control')||''))
  throw Error('Recipient rejection must prohibit client cache storage');
 return true;
}
module.exports={parsePort,assertTwoApiEnvironment,recipientProbe,assertDeniedResponse};
