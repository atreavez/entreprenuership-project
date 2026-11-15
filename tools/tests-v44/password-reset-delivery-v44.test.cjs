'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..');
function transpile(file,req){const filename=path.join(root,file),js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,require:req,Buffer,URL,AbortSignal,Error,Promise},{filename});return module.exports}
const policy=transpile('apps/api/src/contexts/identity/domain/password-reset-policy.ts',name=>require(name));
const delivery=transpile('apps/api/src/contexts/identity/infrastructure/password-reset-delivery.ts',name=>{if(name==='../domain/password-reset-policy')return policy;throw Error('Import blocked')});
const env={PASSWORD_RESET_RELAY_URL:'https://relay.example.org/v1/dispatch',PASSWORD_RESET_RELAY_TOKEN:'owner-managed-example-token-fNotReal_563mP9Q_9HJ',PASSWORD_RESET_PUBLIC_ORIGIN:'https://app.example.org',WEB_ORIGIN:'https://app.example.org',PASSWORD_RESET_LOOKUP_PEPPER:'b3a75cde109f4628edca5b0f774d912e624bb38a5f6c0dfe13597ab8e4d2c091'};
test('HTTPS relay sends private token only in server-to-server POST body and blocks redirects',async()=>{
 const token=policy.makePasswordResetToken(),sent=[];
 await delivery.sendPasswordResetNotice(env,'member@example.org',token,async(url,request)=>{sent.push({url,request});return {ok:true,status:202}});
 assert.equal(sent.length,1);const {url,request}=sent[0];
 assert.equal(url,env.PASSWORD_RESET_RELAY_URL);assert(!url.includes(token));
 assert.equal(request.method,'POST');assert.equal(request.redirect,'error');
 assert.equal(request.headers.Authorization,`Bearer ${env.PASSWORD_RESET_RELAY_TOKEN}`);
 const message=JSON.parse(request.body);assert.equal(message.to,'member@example.org');
 assert(message.text.includes('#reset-password/'+token));
 assert(!JSON.stringify(request.headers).includes(token));
});
test('relay errors refuse delivery and no fallback to HTTP or unapproved origins',async()=>{
 const token=policy.makePasswordResetToken();
 await assert.rejects(()=>delivery.sendPasswordResetNotice(env,'member@example.org',token,async()=>({ok:false,status:502})),/DELIVERY_FAILED/);
 await assert.rejects(()=>delivery.sendPasswordResetNotice({...env,PASSWORD_RESET_RELAY_URL:'http://relay.example.org'},'member@example.org',token,async()=>({ok:true})),/NOT_CONFIGURED/);
 await assert.rejects(()=>delivery.sendPasswordResetNotice({...env,PASSWORD_RESET_PUBLIC_ORIGIN:'https://phishing.example.org'},'member@example.org',token,async()=>({ok:true})),/NOT_CONFIGURED/);
});
