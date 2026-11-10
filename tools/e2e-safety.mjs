/** Prevent test fixtures being written to a remote or unmarked environment. */
export async function assertSafeE2eTarget(raw,{allowMutation=process.env.ASSETTRUST_E2E_ALLOW_MUTATION,expectedTargetId=process.env.ASSETTRUST_E2E_EXPECT_TARGET,fetchImpl=fetch}={}){
 if(allowMutation!=='YES')throw Error('E2E writes require explicit ASSETTRUST_E2E_ALLOW_MUTATION=YES');
 if(!expectedTargetId||expectedTargetId.length<12)throw Error('Specify ASSETTRUST_E2E_EXPECT_TARGET for a disposable API instance');
 let url;try{url=new URL(raw)}catch{throw Error('Invalid E2E target URL')}
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','::1'].includes(url.hostname)||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw Error('E2E target must be a bare localhost HTTP origin');
 const origin=url.origin;
 let response,payload;
 try{
  response=await fetchImpl(origin+'/api/v1/healthz',{method:'GET',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('health check failed');
  payload=await response.json();
 }catch{throw Error('E2E target not reachable as a healthy local AssetTrust instance')}
 if(payload?.service!=='assettrust-api'||payload?.e2eTargetId!==expectedTargetId)throw Error('E2E target marker mismatch; test writes refused');
 return origin+'/api/v1';
}
