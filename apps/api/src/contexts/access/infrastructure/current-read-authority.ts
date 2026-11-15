import { ForbiddenException } from '@nestjs/common';

type Queryable = {query(sql:string,params?:unknown[]):Promise<{rows:any[]}>};
type Actor = {id:string;organizationId:string};

/** Transaction-local membership snapshot for confidential overview reads.
 * The FOR SHARE lock serializes demotion/suspension with the overview query.
 * Never derive privileged scope from a JWT role claim.
 */
export async function currentReadAuthority(tx:Queryable,actor:Actor):Promise<{role:string;administrator:boolean}>{
 const {rows}=await tx.query(`SELECT role FROM users
  WHERE id=$1 AND organization_id=$2 AND suspended_at IS NULL
  FOR SHARE`,[actor.id,actor.organizationId]);
 if(rows.length!==1||!['ORG_ADMIN','REVIEWER','CLIENT','SURVEYOR','LEGAL_REVIEWER'].includes(rows[0].role))
  throw new ForbiddenException('Current organization membership is required');
 return {role:rows[0].role,administrator:rows[0].role==='ORG_ADMIN'};
}
