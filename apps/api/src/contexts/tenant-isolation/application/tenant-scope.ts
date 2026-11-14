import {validateTenantId} from '../domain/tenant-policy';
/** Transaction-local scope: never set tenant GUC on a pooled session outside BEGIN. */
export async function setTenantScope(tx:{query(sql:string,params?:any[]):Promise<any>},organizationId:unknown):Promise<void>{
 const org=validateTenantId(organizationId);
 await tx.query("SELECT set_config('assettrust.tenant_id',$1,true)",[org]);
}

/** Recipient identity is verified by the server auth guard, never a URL/query parameter.
 * Use only inside BEGIN; a pooled connection cannot retain this scoped actor. */
export async function setRecipientScope(tx:{query(sql:string,params?:any[]):Promise<any>},organizationId:unknown,actorId:unknown):Promise<void>{
 await setTenantScope(tx,organizationId);
 const actor=validateTenantId(actorId);
 await tx.query("SELECT set_config('assettrust.actor_id',$1,true)",[actor]);
}
