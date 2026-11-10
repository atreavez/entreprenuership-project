'use strict';
/** Check the inward dependency rule across ALL AssetTrust bounded contexts. */
const {readdirSync,readFileSync}=require('node:fs');
const {join,relative,sep}=require('node:path');
function listFiles(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
 const name=join(dir,entry.name);return entry.isDirectory()?listFiles(name):(entry.isFile()&&name.endsWith('.ts')?[name]:[]);
});}
function validateLayerSource(source,file){
 const failures=[];
 const imports=Array.from(source.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),m=>m[1]||m[2]||m[3]);
 for(const specifier of imports){
  if(/^(?:@nestjs(?:\/|$)|pg(?:\/|$)|express(?:\/|$)|multer(?:\/|$)|react(?:\/|$)|axios(?:\/|$)|@prisma(?:\/|$))/.test(specifier))failures.push(`${file}: forbidden framework/database import ${specifier}`);
  if(/(?:^|\/)infrastructure(?:\/|$)/.test(specifier))failures.push(`${file}: inward dependency rule violated by ${specifier}`);
  if(/^(?:node:)?(?:fs|http|https|net|child_process|tls)(?:\/|$)/.test(specifier))failures.push(`${file}: I/O imported into domain/application ${specifier}`);
 }
 if(/\bprocess\.env\b/.test(source))failures.push(`${file}: domain/application reads process.env directly`);
 if(/@(?:Controller|Module|Injectable|UseGuards|Inject|Get|Post|Patch|Delete)\b/.test(source))failures.push(`${file}: framework decorator in domain/application`);
 return failures;
}
function inspectCleanArchitecture(root){
 const dir=join(root,'apps','api','src','contexts');
 const files=listFiles(dir).filter(p=>p.split(sep).some(x=>x==='domain'||x==='application'));
 return {checked:files.length,failures:files.flatMap(f=>validateLayerSource(readFileSync(f,'utf8'),relative(root,f)))};
}
module.exports={validateLayerSource,inspectCleanArchitecture};
