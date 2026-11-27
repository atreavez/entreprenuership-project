'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../apps/web/src');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('anchoring dashboard is wired into admin navigation and keyed by identity',()=>{
 const s=read('App.tsx');assert(s.includes("id:'anchoring'"));assert(s.includes("page==='anchoring'?<AnchoringPage"));assert(s.includes("key={user.organizationId+':'+user.id}"));
});
test('dashboard uses authenticated API, local-proof precondition, revision recovery and read-only preview',()=>{
 const s=read('AnchoringPage.tsx');
 for(const t of ["role==='ORG_ADMIN'&&!DEMO","'/integrations/local-proof'","'/anchoring/jobs'","expectedProof:proof.proof","expectedRevision:selectedJob.revision","+'/recover'","generation.current","historyGen.current","No blockchain transaction submitted"])assert(s.includes(t),t);
 assert(!s.includes('localStorage'));assert(!s.includes('sessionStorage'));
});
test('structured platform configuration uses the existing independently approved change path',()=>{
 const s=read('AdminControlPage.tsx'),editor=read('AnchorPolicyEditor.tsx');
 assert(s.includes("d.key==='anchoring.provider_policy'"));assert(s.includes("post('/admin-control/changes'"));
 for(const field of ['enabled','providerId','networkId','minConfirmations','retryBaseMs','maxAttempts','pollMs'])assert(editor.includes(field));
 assert(editor.includes('not external dispatch'));
});
