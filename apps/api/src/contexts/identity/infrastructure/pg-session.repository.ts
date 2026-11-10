import { Injectable } from '@nestjs/common';
import { Database } from '../../../database';
import type { SessionRepository,SessionInfo } from '../application/session-usecases';
@Injectable()
export class PgSessionRepository implements SessionRepository{
 constructor(private db:Database){}
 async create(input:{id:string;userId:string;organizationId:string;refreshHash:string;expiresAt:Date;device:string}){
  await this.db.query('INSERT INTO auth_sessions(id,user_id,organization_id,refresh_hash,expires_at,absolute_expires_at,device) VALUES($1,$2,$3,$4,$5,now()+interval \'30 days\',$6)',[input.id,input.userId,input.organizationId,input.refreshHash,input.expiresAt,input.device]);
 }
 async rotate(id:string,presentedHash:string,nextHash:string,expiry:Date):Promise<'ok'|'reused'|'invalid'>{
  return this.db.transaction(async tx=>{
   const {rows}=await tx.query('SELECT id,refresh_hash,expires_at,absolute_expires_at,revoked_at FROM auth_sessions WHERE id=$1 FOR UPDATE',[id]);const row=rows[0];
   if(!row||row.revoked_at||new Date(row.expires_at).getTime()<=Date.now()||new Date(row.absolute_expires_at).getTime()<=Date.now())return 'invalid';
   // Digest comparisons are constant time. On replay revoke the entire session and commit the revocation.
   const {timingSafeEqual}=await import('node:crypto');
   const expected=Buffer.from(row.refresh_hash,'hex'),provided=Buffer.from(presentedHash,'hex');
   if(expected.length!==32||provided.length!==32||!timingSafeEqual(expected,provided)){
    await tx.query('UPDATE auth_sessions SET revoked_at=now(),revocation_reason=$2 WHERE id=$1',[id,'REFRESH_REPLAY']);return 'reused';
   }
   await tx.query('UPDATE auth_sessions SET refresh_hash=$2,expires_at=LEAST($3,absolute_expires_at),last_used_at=now() WHERE id=$1',[id,nextHash,expiry]);return 'ok';
  });
 }
 async find(id:string):Promise<SessionInfo|null>{const {rows}=await this.db.query('SELECT id,user_id,organization_id,expires_at,revoked_at FROM auth_sessions WHERE id=$1',[id]);const r=rows[0];return r?{id:r.id,userId:r.user_id,organizationId:r.organization_id,expiresAt:new Date(r.expires_at),revokedAt:r.revoked_at?new Date(r.revoked_at):null}:null;}
 async revoke(id:string,userId:string){await this.db.query('UPDATE auth_sessions SET revoked_at=now(),revocation_reason=$3 WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',[id,userId,'USER_LOGOUT']);}
 async revokeOthers(userId:string,keepId:string){await this.db.query('UPDATE auth_sessions SET revoked_at=now(),revocation_reason=$3 WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL',[userId,keepId,'SECURITY_CHANGE']);}
 async revokeAll(userId:string){await this.db.query('UPDATE auth_sessions SET revoked_at=now(),revocation_reason=$2 WHERE user_id=$1 AND revoked_at IS NULL',[userId,'LOGOUT_ALL']);}
 async list(userId:string){const {rows}=await this.db.query('SELECT id,device,created_at,last_used_at,expires_at,revoked_at FROM auth_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[userId]);return rows;}
}
