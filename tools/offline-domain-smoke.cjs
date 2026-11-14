// Tests exported domain helpers without npm packages or a database.
// This does NOT replace NestJS/PostgreSQL integration tests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}})();
const dir=path.join(__dirname,'../apps/api/src');
const MockErrors=['BadRequestException','ConflictException','ForbiddenException','NotFoundException','UnauthorizedException'];
const common={};for(const name of MockErrors){common[name]=class extends Error{constructor(message){super(message);this.name=name}}}
for(const name of ['Controller','Get','Post','Param','Body','Req','UseGuards','Injectable','Module','Patch','Delete','Query'])common[name]=()=>()=>undefined;
const cache=new Map();const fake={
 './database':{Database:class Database{}},'./auth':{AuthGuard:class AuthGuard{},AuthModule:class AuthModule{}},'./access':{AccessModule:class AccessModule{},AccessService:class AccessService{}},
};
function load(file){if(cache.has(file))return cache.get(file);const src=fs.readFileSync(path.join(dir,file+'.ts'),'utf8');const code=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText;const module={exports:{}};
 const localRequire=(name)=>{if(name==='@nestjs/common')return common;if(name==='node:crypto')return require('node:crypto');if(name==='pg')return {};if(name==='argon2')return {__esModule:true,default:{hash:async()=>'',verify:async()=>true}};if(name==='@nestjs/throttler')return {Throttle:()=>()=>{}};if(name.startsWith('.')){const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),name));return fake['./'+target]||load(target)};throw Error('Unmocked import '+name)};
 vm.runInNewContext(code,{module,exports:module.exports,require:localRequire,console,process,Buffer,Date,JSON,Reflect,Promise},{filename:file+'.ts'});cache.set(file,module.exports);return module.exports;
}
fake['./audit']={AuditService:class AuditService{},AuditModule:class AuditModule{},auditHash:null};
const {nextStage,authorizeStage}=load('cases');
const stages=['INTAKE','DOCUMENT_REVIEW','REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW','CLOSED'];
for(let i=0;i<stages.length-1;i++)assert.equal(nextStage(stages[i]),stages[i+1]);
assert.throws(()=>nextStage('CLOSED'));
const reviewer={role:'REVIEWER',professionalApproved:false};
assert.doesNotThrow(()=>authorizeStage(reviewer,'REGISTRY_SEARCH'));
assert.throws(()=>authorizeStage(reviewer,'LEGAL_REVIEW'));
assert.doesNotThrow(()=>authorizeStage({...reviewer,role:'ORG_ADMIN'},'FINAL_REVIEW')); // Admin can submit final decision but cannot review it.
assert.doesNotThrow(()=>authorizeStage({...reviewer,role:'LEGAL_REVIEWER',professionalApproved:true},'LEGAL_REVIEW'));
console.log('Passed: sequential stage transitions + professional role gates (offline pure helper smoke).');

const {validDueDate}=load('operations');
const {invitationExpired}=load('team');
const {localProof}=load('integrations');
assert.throws(()=>validDueDate('banana'));
assert.equal(validDueDate('2026-12-01T09:00:00Z'),'2026-12-01T09:00:00.000Z');
assert.equal(invitationExpired(new Date('2026-11-05T00:00:00Z'),Date.parse('2026-11-06T00:00:00Z')),true);
assert.equal(invitationExpired(new Date('2026-11-07T00:00:00Z'),Date.parse('2026-11-06T00:00:00Z')),false);
assert.notEqual(localProof('org-1','GENESIS'),localProof('org-2','GENESIS'));
assert.notEqual(localProof('org-1','GENESIS'),localProof('org-1','another'));
console.log('Passed: invitation expiry, due date validation and organization-bound local commitments.');
