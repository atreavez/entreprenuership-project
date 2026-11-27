import {setTenantScope} from './contexts/tenant-isolation/application/tenant-scope';
import {assertCurrentAdminSession} from './contexts/identity/infrastructure/current-admin-step-up';
import { Injectable, Controller, Get, Req, UseGuards, Module } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Database } from './database';
import { uid, hash, UserAuth } from './common';
const canonical = (v:any):any => Array.isArray(v) ? v.map(canonical) : v && typeof v==='object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
export const auditHash = (org:string,actor:string,action:string,entityType:string,entityId:string,detail:Record<string,unknown>,timestamp:string,prevHash:string)=>hash(JSON.stringify([org,actor,action,entityType,entityId,canonical(detail),timestamp,prevHash]));
import { AuthGuard, AuthModule } from './auth';
@Injectable()
export class AuditService{
 constructor(private db:Database){}
 async write(tx:PoolClient,u:UserAuth,action:string,entityType:string,entityId:string,detail:Record<string,unknown>={}){
  // The audit chain must never read another tenant's head or insert without RLS context.
  await setTenantScope(tx,u.organizationId);
  // Locks audit chain per organization even when multiple staff submit at the same time.
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[u.organizationId]);
  const previous=await tx.query('SELECT event_hash FROM audit_events WHERE organization_id=$1 ORDER BY event_sequence DESC LIMIT 1',[u.organizationId]);
  const prevHash=previous.rows[0]?.event_hash||'GENESIS';const eventId=uid();const timestamp=new Date().toISOString();
  // Serialize exactly once: hash the same JSON snapshot that PostgreSQL persists.
  // Date/toJSON and omitted properties otherwise produce divergent chain hashes.
  const detailJson=JSON.stringify(detail);
  const storedDetail=JSON.parse(detailJson);
  if(storedDetail===null||typeof storedDetail!=='object'||Array.isArray(storedDetail))throw new Error('Audit detail must serialize to a JSON object');
  const eventHash=auditHash(u.organizationId,u.id,action,entityType,entityId,storedDetail,timestamp,prevHash);
  await tx.query(`INSERT INTO audit_events(id,organization_id,actor_id,action,entity_type,entity_id,detail,previous_hash,event_hash,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,[eventId,u.organizationId,u.id,action,entityType,entityId,detailJson,prevHash,eventHash,timestamp]);
  return eventHash;
 }
 async verify(u:UserAuth,sid:string){
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   await assertCurrentAdminSession(tx,u,sid);
   const {rows}=await tx.query('SELECT * FROM audit_events WHERE organization_id=$1 ORDER BY event_sequence ASC',[u.organizationId]);
  let prev='GENESIS';
  for(const event of rows){
   const invalid={verified:false,checked:rows.length,firstInvalidEventId:event.id};
   if(event.organization_id!==u.organizationId||event.previous_hash!==prev)return invalid;
   const date=new Date(event.created_at);
   if(event.created_at==null||!Number.isFinite(date.getTime()))return invalid;
   const expected=auditHash(event.organization_id,event.actor_id,event.action,event.entity_type,event.entity_id,event.detail,date.toISOString(),prev);
   if(expected!==event.event_hash)return invalid;
   prev=event.event_hash;
  }return {verified:true,checked:rows.length,head:prev,disclaimer:'Local audit chain integrity only. No external blockchain notarization has been performed. A deleted suffix or fully recomputed chain cannot be detected without an independently trusted commitment.'};
  });
 }
 async list(u:UserAuth,sid:string){
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   await assertCurrentAdminSession(tx,u,sid);
   const {rows}=await tx.query('SELECT id,actor_id,action,entity_type,entity_id,previous_hash,event_hash,created_at FROM audit_events WHERE organization_id=$1 ORDER BY event_sequence DESC LIMIT 100',[u.organizationId]);return rows;
  });
 }
}
@Controller('audit')@UseGuards(AuthGuard)
export class AuditController{constructor(private svc:AuditService){}@Get('verify')verify(@Req()req:any){return this.svc.verify(req.user,req.sessionId);}@Get()list(@Req()req:any){return this.svc.list(req.user,req.sessionId);}}
@Module({imports:[AuthModule],providers:[AuditService],controllers:[AuditController],exports:[AuditService]})export class AuditModule{}
