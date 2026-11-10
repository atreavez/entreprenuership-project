/** Framework-independent application service. SQL, cookies, JWT are outside this layer. */
import { ACCESS_TTL_SECONDS, REFRESH_TTL_MS, hashOpaque, makeRefreshToken, newSessionId, parseRefreshToken } from '../domain/identity-policy';
export type Subject={id:string;organizationId:string};
export type SessionInfo={id:string;userId:string;organizationId:string;expiresAt:Date;revokedAt:Date|null};
export interface SessionRepository {
 create(session:{id:string;userId:string;organizationId:string;refreshHash:string;expiresAt:Date;device:string}):Promise<void>;
 rotate(id:string,presentedHash:string,nextHash:string,nextExpiry:Date):Promise<'ok'|'reused'|'invalid'>;
 find(id:string):Promise<SessionInfo|null>;
 revoke(id:string,userId:string):Promise<void>;
 revokeOthers(userId:string,keepId:string):Promise<void>;
 revokeAll(userId:string):Promise<void>;
 list(userId:string):Promise<{id:string;device:string;created_at:string;last_used_at:string;expires_at:string;revoked_at:string|null}[]>;
}
export interface AccessTokenIssuer {sign(sub:Subject,sessionId:string,ttlSeconds:number):Promise<string>}
export class SessionUseCases{
 constructor(private sessions:SessionRepository,private issuer:AccessTokenIssuer,private clock:()=>number=()=>Date.now()){}
 async create(subject:Subject,device='Unknown device'){
  const id=newSessionId(),refreshToken=makeRefreshToken(id);
  await this.sessions.create({id,userId:subject.id,organizationId:subject.organizationId,refreshHash:hashOpaque(refreshToken),expiresAt:new Date(this.clock()+REFRESH_TTL_MS),device:device.slice(0,160)});
  return {accessToken:await this.issuer.sign(subject,id,ACCESS_TTL_SECONDS),refreshToken,sessionId:id,expiresIn:ACCESS_TTL_SECONDS};
 }
 async refresh(token:unknown){const {sessionId}=parseRefreshToken(token);const original=await this.sessions.find(sessionId);if(!original)throw new Error('Invalid session');
  const replacement=makeRefreshToken(sessionId);
  const result=await this.sessions.rotate(sessionId,hashOpaque(token as string),hashOpaque(replacement),new Date(this.clock()+REFRESH_TTL_MS));
  if(result!=='ok')throw new Error(result==='reused'?'Refresh token replay detected; session revoked':'Session expired or revoked');
  return {accessToken:await this.issuer.sign({id:original.userId,organizationId:original.organizationId},sessionId,ACCESS_TTL_SECONDS),refreshToken:replacement,sessionId,subject:{id:original.userId,organizationId:original.organizationId},expiresIn:ACCESS_TTL_SECONDS};
 }
 async authorize(id:string,subject:Subject){const session=await this.sessions.find(id);return !!session&&session.userId===subject.id&&session.organizationId===subject.organizationId&&!session.revokedAt&&session.expiresAt.getTime()>this.clock();}
 revoke(id:string,userId:string){return this.sessions.revoke(id,userId)}
 revokeOthers(userId:string,exceptId:string){return this.sessions.revokeOthers(userId,exceptId)}
 revokeAll(userId:string){return this.sessions.revokeAll(userId)}
 list(userId:string){return this.sessions.list(userId)}
}
