'use strict';
/**
 * v0.80 pre-install source/import contract.
 * Checks that each workspace explicitly declares the packages it imports.
 * This does NOT resolve a registry graph, replace an npm lockfile, typecheck,
 * or certify build/runtime readiness. No network/process/DB access.
 */
const fs=require('node:fs');
const path=require('node:path');
const {builtinModules}=require('node:module');
const ROOT=path.resolve(__dirname,'..');
const EXTENSIONS=new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs']);
const BUILTINS=new Set(builtinModules.flatMap(x=>[x,x.replace(/^node:/,''),'node:'+x.replace(/^node:/,'')]));
const MAX_SOURCE_BYTES=2*1024*1024;
function safeFile(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_SOURCE_BYTES)throw Error('UNSAFE_OR_OVERSIZED_SOURCE');return fs.readFileSync(file,'utf8');}
function sourceFiles(dir){
 const result=[],stack=[dir];
 while(stack.length){const here=stack.pop();const entries=fs.readdirSync(here,{withFileTypes:true});
  for(const item of entries){
   const abs=path.join(here,item.name);
   if(item.isSymbolicLink())throw Error('SYMLINK_IN_SOURCE_TREE');
   if(item.isDirectory()){if(item.name==='node_modules'||item.name==='dist')throw Error('BUILD_OUTPUT_IN_SOURCE_TREE');stack.push(abs);}
   else if(item.isFile()&&EXTENSIONS.has(path.extname(item.name)))result.push(abs);
   else if(!item.isFile())throw Error('NONREGULAR_SOURCE_ENTRY');
  }
 }
 return result.sort();
}
function packageName(spec){
 if(typeof spec!=='string'||!spec||spec.startsWith('.')||spec.startsWith('/')||spec.startsWith('#'))return null;
 if(BUILTINS.has(spec)||spec.startsWith('node:'))return null;
 if(spec.startsWith('@')){const segments=spec.split('/');return segments.length>=2?segments.slice(0,2).join('/'):spec;}
 return spec.split('/')[0];
}
function moduleSpecifiers(source){
 // Examine import/export statements as units; accept multiline named imports.
 // Require an explicit from/side-effect string so JSX text cannot be misread as an import.
 const found=new Set();
 const lines=String(source).split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  if(!/^\s*(?:import|export)\s/.test(lines[i])||/^\s*\/\//.test(lines[i]))continue;
  // An exported value or JSX expression may contain text like 'from pkg'.
  // Only re-exports with a specifier can declare external dependencies.
  if(/^\s*export\s/.test(lines[i])&&!/^\s*export\s+(?:\*|\{|type\s+(?:\{|\*))/.test(lines[i]))continue;
  let statement=lines[i];let j=i;
  while(j+1<lines.length&&j-i<12&&!/[;]\s*(?:\/\/.*)?$/.test(statement.trim())&&
   !/\bfrom\s*['"][^'"\n]+['"]/.test(statement)&&
   !/^\s*import\s*['"][^'"\n]+['"]/.test(statement)){
    j++;statement+='\n'+lines[j];
  }
  const match=statement.match(/\bfrom\s*['"]([^'"\n]+)['"]/)||statement.match(/^\s*import\s*['"]([^'"\n]+)['"]/);
  if(match)found.add(match[1]);
  i=j;
 }
 for(const re of [/\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,/\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g]){
  for(const match of source.matchAll(re))found.add(match[1]);
 }
 return [...found].sort();
}
function check(root=ROOT){
 const issues=[],seen=[],workspaces=[['api','apps/api'],['web','apps/web']];
 for(const [name,dir] of workspaces){
  const folder=path.join(root,dir);
  let manifest,files=[];
  try{manifest=JSON.parse(safeFile(path.join(folder,'package.json')));
    files=sourceFiles(path.join(folder,'src'));
    if(name==='web')files.push(path.join(folder,'vite.config.ts'));
  }catch{issues.push('INVALID_OR_MISSING_WORKSPACE:'+name);continue;}
  const prod=manifest.dependencies||{},dev=manifest.devDependencies||{};
  for(const file of files){
   let text;try{text=safeFile(file);}catch{issues.push('UNSAFE_SOURCE_FILE:'+path.relative(root,file));continue;}
   const rel=path.relative(root,file).replaceAll('\\','/');
   for(const spec of moduleSpecifiers(text)){
    const dep=packageName(spec);if(!dep)continue;
    const configOnly=file===path.join(folder,'vite.config.ts');
    const declared=Object.hasOwn(prod,dep)||(configOnly&&Object.hasOwn(dev,dep));
    seen.push({workspace:name,file:rel,dependency:dep,declared});
    if(!declared)issues.push('UNDECLARED_DIRECT_IMPORT:'+name+':'+rel+':'+dep);
   }
  }
 }
 const unique=Object.entries(seen.reduce((out,entry)=>{out[entry.workspace+':'+entry.dependency]=entry.declared;return out;},{}));
 return {schema:'ASSETTRUST_V80_DIRECT_DEPENDENCY_POLICY',ok:issues.length===0,productionApproved:false,
  sourceImportsInspected:seen.length,directPackages:unique.map(([name])=>name).sort(),issues,
  note:'Source import declarations only; genuine npm registry resolution, audited lockfile, npm ci and compiled tests remain required.'};
}
function main(){const result=check();console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}
if(require.main===module){try{main();}catch(error){console.error('BLOCKED: '+error.message);process.exitCode=1;}}
module.exports={packageName,moduleSpecifiers,sourceFiles,check};
