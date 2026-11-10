import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Database } from './database';
import { uid, hash, UserAuth, assertRole } from './common';
const canonical = (v:any):any => Array.isArray(v) ? v.map(canonical) : v && typeof v==='object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
export const auditHash = (org:string,actor:string,action:string,entityType:string,entityId:string,detail:Record<string,unknown>,timestamp:string,prevHash:string)=>hash(JSON.stringify([org,actor,action,entityType,entityId,canonical(detail),timestamp,prevHash]));

@Injectable()
export class AuditService{
 constructor(private db:Database){}
 async write(tx:PoolClient,u:UserAuth,action:string,entityType:string,entityId:string,detail:Record<string,unknown>={}){
  // Locks audit chain per organization even when multiple staff submit at the same time.
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[u.organizationId]);
  const previous=await tx.query('SELECT event_hash FROM audit_events WHERE organization_id=$1 ORDER BY event_sequence DESC LIMIT 1',[u.organizationId]);
  const prevHash=previous.rows[0]?.event_hash||'GENESIS';const eventId=uid();const timestamp=new Date().toISOString();
  const eventHash=auditHash(u.organizationId,u.id,action,entityType,entityId,detail,timestamp,prevHash);
  await tx.query(`INSERT INTO audit_events(id,organization_id,actor_id,action,entity_type,entity_id,detail,previous_hash,event_hash,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,[eventId,u.organizationId,u.id,action,entityType,entityId,JSON.stringify(detail),prevHash,eventHash,timestamp]);
  return eventHash;
 }
 async verify(u:UserAuth){assertRole(u,['ORG_ADMIN']);
  const {rows}=await this.db.query('SELECT * FROM audit_events WHERE organization_id=$1 ORDER BY event_sequence ASC',[u.organizationId]);
  let prev='GENESIS';
  for(const event of rows){
   const timestamp=new Date(event.created_at).toISOString();
   const expected=auditHash(event.organization_id,event.actor_id,event.action,event.entity_type,event.entity_id,event.detail,timestamp,prev);
   if(expected!==event.event_hash||event.previous_hash!==prev)return {verified:false,checked:rows.length,firstInvalidEventId:event.id};
   prev=event.event_hash;
  }return {verified:true,checked:rows.length,head:prev,disclaimer:'Local audit chain integrity only. No external blockchain notarization has been performed.'};
 }
 async list(u:UserAuth){assertRole(u,['ORG_ADMIN']);
  const {rows}=await this.db.query('SELECT id,actor_id,action,entity_type,entity_id,previous_hash,event_hash,created_at FROM audit_events WHERE organization_id=$1 ORDER BY event_sequence DESC LIMIT 100',[u.organizationId]);return rows;
 }
}
