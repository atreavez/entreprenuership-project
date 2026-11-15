'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const src=path.resolve(__dirname,'../../apps/api/src');
class ForbiddenException extends Error{}class BadRequestException extends Error{}class NotFoundException extends Error{}class ConflictException extends Error{}
const deco=()=>()=>{};
const nest={ForbiddenException,BadRequestException,NotFoundException,ConflictException,Body:deco,Controller:deco,Get:deco,Post:deco,Param:deco,Query:deco,Req:deco,UseGuards:deco,Injectable:deco,Module:deco};
function load(file,imports={}){const name=path.join(src,file),txt=fs.readFileSync(name,'utf8');const js=ts.transpileModule(txt,{fileName:name,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:id=>{if(Object.hasOwn(imports,id))return imports[id];throw Error('Unexpected import '+id)},console,Date,JSON},{filename:name,timeout:5000});return m.exports}
const policy=load('contexts/admin-control/domain/configuration-policy.ts');
const current=load('contexts/identity/infrastructure/current-admin-step-up.ts',{'@nestjs/common':nest});
const {AdminControlService}=load('contexts/admin-control/infrastructure/admin-control.module.ts',{
 '@nestjs/common':nest,'../../../database':{},'../../../auth':{AuthGuard:class{},AuthModule:class{}},'../../../audit':{AuditModule:class{}},
 '../../../common':{uid:()=>`00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`,isUuid:s=>s},
 '../../identity/infrastructure/current-admin-step-up':current,'../domain/configuration-policy':policy
});
let counter=0;
const owner={id:'o1',organizationId:'org1',role:'ORG_ADMIN'};
const second={id:'o2',organizationId:'org1',role:'ORG_ADMIN'};
function create({stepUp=true,platform=false,orgAdmin=true}={}){
 const state={rows:new Map(),proposals:new Map(),audit:[],queries:[],stepUp,platform,orgAdmin};
 const database={transaction:async cb=>cb({query:query}),query};
 async function query(sql,args=[]){state.queries.push({sql,args});
  if(sql.includes('JOIN auth_sessions')&&sql.includes('JOIN auth_mfa_credentials'))return {rows:state.stepUp?[{id:args[0]}]:[]};
  if(sql.includes('JOIN auth_sessions')&&sql.includes('SELECT u.id'))return {rows:state.orgAdmin?[{id:args[0]}]:[]};
  if(sql.includes('FROM platform_admin_appointments'))return {rows:state.platform?[{user_id:args[0]}]:[]};
  if(sql.includes('FROM users u WHERE u.id=$1'))return {rows:state.orgAdmin?[{id:args[0]}]:[]};
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('FROM admin_configuration_values')&&sql.includes('WHERE scope=$1')&&sql.includes('FOR UPDATE')){const key=[args[0],args[1],args[2]].join('|');return {rows:state.rows.has(key)?[{version:state.rows.get(key).version}]:[]};}
  if(sql.includes('FROM admin_configuration_changes')&&sql.includes("status='PENDING'")&&sql.includes('FOR UPDATE')){const match=[...state.proposals.values()].find(p=>p.scope===args[0]&&p.scope_id===args[1]&&p.setting_key===args[2]&&p.status==='PENDING');return {rows:match?[{id:match.id}]:[]};}
  if(sql.includes('INSERT INTO admin_configuration_changes')){const [id,scope,scope_id,setting_key,serialized,expected_version,status,submitted_by,reviewed_by,reviewed_at]=args;state.proposals.set(id,{id,scope,scope_id,setting_key,proposed_value:JSON.parse(serialized),expected_version,status,submitted_by,reviewed_by,reviewed_at});return {rows:[],rowCount:1};}
  if(sql.includes('INSERT INTO admin_configuration_values')){const [scope,scope_id,key,val,version,actor,expected]=args;const k=[scope,scope_id,key].join('|');const before=state.rows.get(k);if(before && before.version!==expected)return {rows:[]};state.rows.set(k,{value:JSON.parse(val),version,actor});return {rows:[{version}]};}
  if(sql.includes('FROM admin_configuration_changes WHERE id=$1')){const p=state.proposals.get(args[0]);return {rows:p?[p]:[]};}
  if(sql.includes('UPDATE admin_configuration_changes SET status=')){const p=state.proposals.get(args[0]);Object.assign(p,{status:args[1],reviewed_by:args[2],reviewed_at:new Date()});return {rows:[]};}
  if(sql.includes('SELECT setting_key AS key,value,version,updated_at'))return {rows:[...state.rows].filter(([key])=>key.startsWith(args.join('|')+'|')).map(([key,val])=>({key:key.split('|').at(-1),...val}))};
  if(sql.includes('FROM admin_configuration_changes')&&sql.includes('ORDER BY submitted_at'))return {rows:[...state.proposals.values()].filter(p=>p.scope===args[0]&&p.scope_id===args[1])};
  if(sql.includes('SELECT id,name,created_at FROM organizations'))return {rows:[{id:'org1',name:'Tenant one'}]};
  if(sql.includes('SELECT user_id FROM platform_admin_appointments'))return {rows:state.platform?[{}]:[]};
  throw Error('Unhandled SQL: '+sql);
 }
 const audit={write:async(_tx,user,action,_type,id,detail)=>state.audit.push({user,action,id,detail})};
 return {svc:new AdminControlService(database,audit),state};
}
const body=(scope,key,value,expectedVersion=0)=>({scope,key,value,expectedVersion});
test('non platform admin cannot update global settings even with valid MFA',async()=>{const x=create();await assert.rejects(()=>x.svc.propose(owner,'sess',body('platform','branding.product_name','Acme')),ForbiddenException);assert.equal(x.state.proposals.size,0)});
test('missing MFA step-up rejects all writes before applying configuration',async()=>{const x=create({stepUp:false});await assert.rejects(()=>x.svc.propose(owner,'sess',body('organization','workspace.display_name','New')),ForbiddenException);assert.equal(x.state.rows.size,0);assert.equal(x.state.audit.length,0)});
test('unknown settings are blocked even for a platform administrator',async()=>{const x=create({platform:true});await assert.rejects(()=>x.svc.propose(owner,'sess',body('platform','security.disable_mfa',true)),BadRequestException);assert.equal(x.state.rows.size,0)});
test('direct organization settings are tenant scoped, versioned and audited',async()=>{const x=create();const r=await x.svc.propose(owner,'sess',body('organization','workspace.display_name','Team One'));assert.equal(r.status,'APPROVED');assert.equal(r.version,1);assert.equal(x.state.rows.get('organization|org1|workspace.display_name').value,'Team One');assert.equal(x.state.audit.at(-1).action,'ADMIN_SETTING_APPLIED');assert.equal(x.state.audit.at(-1).detail.key,'workspace.display_name')});
test('concurrent stale version rejects update with no audit event',async()=>{const x=create();await x.svc.propose(owner,'sess',body('organization','workspace.display_name','First'));await assert.rejects(()=>x.svc.propose(owner,'sess',body('organization','workspace.display_name','Second',0)),ConflictException);assert.equal(x.state.rows.get('organization|org1|workspace.display_name').value,'First');assert.equal(x.state.audit.length,1)});
test('sensitive change is pending, not immediately effective',async()=>{const x=create();const r=await x.svc.propose(owner,'sess',body('organization','workflow.review_target_days',15));assert.equal(r.status,'PENDING');assert.equal(x.state.rows.size,0);assert.equal(x.state.proposals.size,1);assert.equal(x.state.audit[0].action,'ADMIN_SETTING_PROPOSED')});
test('proposer cannot self-approve high impact configuration',async()=>{const x=create();const r=await x.svc.propose(owner,'sess',body('organization','workflow.review_target_days',15));await assert.rejects(()=>x.svc.decide(owner,'sess',r.id,'APPROVE'),ForbiddenException);assert.equal(x.state.rows.size,0)});
test('independent current administrator approves change and maintains revision',async()=>{const x=create();const r=await x.svc.propose(owner,'sess',body('organization','workflow.review_target_days',15));const result=await x.svc.decide(second,'sess2',r.id,'APPROVE');assert.equal(result.applied,true);assert.equal(x.state.rows.get('organization|org1|workflow.review_target_days').version,1);assert.equal(x.state.audit.at(-1).action,'ADMIN_SETTING_APPROVED')});
test('independent rejection keeps applied settings unchanged',async()=>{const x=create();const r=await x.svc.propose(owner,'sess',body('organization','workflow.review_target_days',15));await x.svc.decide(second,'sess2',r.id,'REJECT');assert.equal(x.state.rows.size,0);assert.equal(x.state.proposals.get(r.id).status,'REJECTED')});
test('other-organization administrator cannot view or decide the tenant proposal',async()=>{const x=create();const r=await x.svc.propose(owner,'sess',body('organization','workflow.review_target_days',15));const outside={...second,organizationId:'org2'};await assert.rejects(()=>x.svc.decide(outside,'sess',r.id,'APPROVE'),NotFoundException);assert.equal(x.state.rows.size,0)});
test('platform settings and org directory require current appointment',async()=>{const x=create({platform:true});const result=await x.svc.propose(owner,'sess',body('platform','branding.product_name','AssetTrust Pro'));assert.equal(result.status,'APPROVED');assert.equal(x.state.rows.get('platform|00000000-0000-0000-0000-000000000000|branding.product_name').value,'AssetTrust Pro');assert.equal((await x.svc.organizations(owner,'sess')).organizations.length,1)});
test('role downgrade or session expiry causes fail-closed read',async()=>{const x=create({orgAdmin:false});await assert.rejects(()=>x.svc.values(owner,'sess','organization'),ForbiddenException);assert.equal(x.state.rows.size,0)});
