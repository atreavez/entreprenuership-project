const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const installedTypes=path.join(root,'node_modules/@types');const globalTypes=path.join(require('node:child_process').execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'ts-node/node_modules/@types');const types=fs.existsSync(installedTypes)?installedTypes:globalTypes;
execFileSync('tsc',['--target','ES2022','--module','CommonJS','--moduleResolution','Node','--skipLibCheck','--typeRoots',types,'--rootDir','apps/api/src/contexts/identity','--outDir','tools/.compiled-v05/unit','apps/api/src/contexts/identity/application/session-usecases.ts','apps/api/src/contexts/identity/domain/identity-policy.ts'],{cwd:root,stdio:'pipe'});
const {SessionUseCases}=require('../.compiled-v05/unit/application/session-usecases.js');
const {hashOpaque,parseRefreshToken}=require('../.compiled-v05/unit/domain/identity-policy.js');
class FakeStore{constructor(clock){this.clock=clock;this.data=new Map();this.replay=0;}
 async create(input){this.data.set(input.id,{...input,revokedAt:null,expiresAt:input.expiresAt})}
 async find(id){const x=this.data.get(id);return x?{id:x.id,userId:x.userId,organizationId:x.organizationId,expiresAt:x.expiresAt,revokedAt:x.revokedAt}:null}
 async rotate(id,presented,next,exp){const x=this.data.get(id);if(!x||x.revokedAt||x.expiresAt.getTime()<=this.clock())return 'invalid';if(x.refreshHash!==presented){x.revokedAt=new Date(this.clock());this.replay++;return 'reused'}x.refreshHash=next;x.expiresAt=exp;return 'ok'}
 async revoke(id,user){const x=this.data.get(id);if(x&&x.userId===user)x.revokedAt=new Date(this.clock());}
 async revokeOthers(user,keep){for(const s of this.data.values())if(s.userId===user&&s.id!==keep)s.revokedAt=new Date(this.clock())}
 async revokeAll(user){for(const s of this.data.values())if(s.userId===user)s.revokedAt=new Date(this.clock())}
 async list(user){return [...this.data.values()].filter(x=>x.userId===user).map(x=>({id:x.id,device:x.device,revoked_at:x.revokedAt}))}
}
const subject={id:'user-a',organizationId:'org-a'};
const boot=(clock=()=>1000000)=>{const store=new FakeStore(clock),signer={sign:async(s,id,ttl)=>`${s.id}:${s.organizationId}:${id}:${ttl}`};return {store,uc:new SessionUseCases(store,signer,clock)}};
test('new session stores refresh hash only and emits 15-minute JWT',async()=>{const {store,uc}=boot();const x=await uc.create(subject,'Kali Linux');const row=store.data.get(x.sessionId);assert.equal(row.refreshHash,hashOpaque(x.refreshToken));assert.ok(!JSON.stringify(row).includes(x.refreshToken));assert.equal(x.expiresIn,900);assert.equal(x.accessToken.split(':').at(-1),'900')});
test('refresh rotates credential: old is rejected and replay revokes the session',async()=>{const {store,uc}=boot();const s=await uc.create(subject);const next=await uc.refresh(s.refreshToken);assert.notEqual(next.refreshToken,s.refreshToken);await assert.rejects(()=>uc.refresh(s.refreshToken),/replay/i);assert.equal(store.replay,1);await assert.rejects(()=>uc.refresh(next.refreshToken),/revoked/)});
test('valid refreshed token still works and remains scoped to original subject',async()=>{const {uc}=boot();const s=await uc.create(subject);const n=await uc.refresh(s.refreshToken);assert.equal(n.subject.organizationId,'org-a');assert.equal(await uc.authorize(s.sessionId,{id:'user-a',organizationId:'org-b'}),false);assert.equal(await uc.authorize(s.sessionId,subject),true)});
test('expired session denies refresh and bearer access',async()=>{let now=1000;const {uc}=boot(()=>now);const s=await uc.create(subject);now+=8*24*3600_000;assert.equal(await uc.authorize(s.sessionId,subject),false);await assert.rejects(()=>uc.refresh(s.refreshToken),/expired/)});
test('revoke and revoke-all invalidate sessions immediately',async()=>{const {uc}=boot();const a=await uc.create(subject);const b=await uc.create(subject);await uc.revoke(a.sessionId,subject.id);assert.equal(await uc.authorize(a.sessionId,subject),false);assert.equal(await uc.authorize(b.sessionId,subject),true);await uc.revokeAll(subject.id);assert.equal(await uc.authorize(b.sessionId,subject),false)});
test('other users cannot revoke or list another user session through repository guard',async()=>{const {uc}=boot();const s=await uc.create(subject);await uc.revoke(s.sessionId,'user-b');assert.equal(await uc.authorize(s.sessionId,subject),true);assert.equal((await uc.list('user-b')).length,0)});
