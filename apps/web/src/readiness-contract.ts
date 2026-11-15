/** Pure transport boundary: a 200 status alone cannot constitute readiness. */
export type VerifiedReadinessEvidence={
 version:string;migrationsVerified:number;rlsPoliciesVerified:number;protectedTablesVerified:number;
};
export function parseReadinessEvidence(body:unknown):VerifiedReadinessEvidence{
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Readiness payload invalid');
 const x=body as Record<string,unknown>;
 if(x.ok!==true||x.service!=='assettrust-api'||x.database!=='ready'||x.postgis!=='ready'||
    x.schema!=='verified-migration-ledger'||x.security!=='rls-policy-contract-verified')
  throw new Error('Readiness contract not verified');
 if(typeof x.version!=='string'||!/^0\.\d+\.\d+$/.test(x.version))throw new Error('API version invalid');
 for(const key of ['migrationsVerified','rlsPoliciesVerified','protectedTablesVerified']){
  if(!Number.isSafeInteger(x[key])||!(typeof x[key]==='number'&&x[key]>0))throw new Error('Verification counters invalid');
 }
 return {version:x.version,migrationsVerified:x.migrationsVerified as number,
  rlsPoliciesVerified:x.rlsPoliciesVerified as number,protectedTablesVerified:x.protectedTablesVerified as number};
}
