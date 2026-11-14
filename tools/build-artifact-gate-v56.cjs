'use strict';
/**
 * AssetTrust v0.56: independent browser/source and post-build artifact gate.
 * No dependency installation, network calls, shell execution, DB actions or secret output.
 * This is a narrow static release check, NOT proof of a secure deployed application.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const sourceFiles=new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs']);
const candidateExtensions=['','.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','/index.ts','/index.tsx','/index.js','/index.jsx'];
const secretMarkers=[
 'DATABASE_URL','DOCUMENT_ENCRYPTION_KEYS','DOCUMENT_ACTIVE_KEY_ID','JWT_SECRET',
 'MFA_ENCRYPTION_KEY','LOGIN_ABUSE_PEPPER','PASSWORD_RESET_RELAY_TOKEN',
 'PASSWORD_RESET_LOOKUP_PEPPER','ASSETTRUST_SIGNING_PRIVATE_KEY',
 '-----BEGIN '+'PRIVATE KEY-----','postgresql://','postgres://'
];
function regular(file){try{const s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink();}catch{return false;}}
function readText(file,max=25*1024*1024){if(!regular(file))throw Error('required file missing or unsafe');const s=fs.statSync(file);if(s.size>max)throw Error('file exceeds security inspection limit');return fs.readFileSync(file,'utf8');}
function relativeImports(text){return [...text.matchAll(/(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"\n]+)['"]/g)].map(m=>m[1]);}
function fileList(base){
 if(!fs.existsSync(base))return [];
 const out=[],queue=[base];
 while(queue.length){const dir=queue.pop();for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
  const abs=path.join(dir,ent.name);
  if(ent.isSymbolicLink())throw Error('symlink inside inspected tree');
  if(ent.isDirectory())queue.push(abs);
  else if(ent.isFile())out.push(abs);
  else throw Error('nonregular file inside inspected tree');
 }}
 return out.sort();
}
function htmlPolicy(html,{built=false}={}){
 const issues=[];
 if(!/^\s*<!doctype\s+html>/i.test(html))issues.push('HTML5 doctype is required');
 if(!/<div\s+id=['"]root['"]\s*>/i.test(html))issues.push('React mount element #root is missing');
 if(!/<meta\s+charset=['"]?utf-8['"]?\s*\/?\s*>/i.test(html))issues.push('UTF-8 charset metadata is missing');
 if(!/name=['"]viewport['"]/.test(html))issues.push('Responsive viewport metadata is missing');
 const scriptTags=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
 if(scriptTags.length!==1)issues.push('Exactly one external module script is required');
 for(const [,attrs,body] of scriptTags){
  if(body.trim())issues.push('Inline executable scripts are forbidden in HTML bootstrap');
  if(!/\btype=['"]module['"]/.test(attrs))issues.push('Entry script must be type=module');
  const src=attrs.match(/\bsrc=['"]([^'"]+)['"]/i)?.[1];
  if(!src)issues.push('Script must have an explicit src');
  else if(built?!/^\/assets\/[\w.-]+\.js$/.test(src):src!=='/src/main.tsx')issues.push('Unexpected script entry path');
 }
 if(/<base\b/i.test(html))issues.push('HTML base element is forbidden');
 if(/<(?:iframe|object|embed)\b/i.test(html))issues.push('Embedded remote content is forbidden in HTML bootstrap');
 if(/<(?:script|link)\b[^>]*(?:src|href)=['"](?:https?:)?\/\//i.test(html))issues.push('Unreviewed external scripts or stylesheet URLs are forbidden');
 return issues;
}
function inspectSource(root=ROOT){
 const issues=[];let filesChecked=0,relativeImportCount=0;
 const web=path.join(root,'apps/web');const htmlPath=path.join(web,'index.html');let html='';
 try{html=readText(htmlPath,256*1024);issues.push(...htmlPolicy(html));}catch{issues.push('Missing or unsafe apps/web/index.html (Vite build entry)');}
 if(!regular(path.join(web,'src/main.tsx')))issues.push('Missing web React entry src/main.tsx');
 const manifests=['package.json','apps/api/package.json','apps/web/package.json'];
 try{const versions=manifests.map(p=>JSON.parse(readText(path.join(root,p),512*1024)).version);if(new Set(versions).size!==1)issues.push('Package versions do not match');}catch{issues.push('Cannot read all workspace package versions');}
 let all=[];
 try{all=[...fileList(path.join(root,'apps/api/src')),...fileList(path.join(root,'apps/web/src')),...[path.join(web,'vite.config.ts')].filter(regular)];}
 catch{issues.push('Unsafe source tree contains a symlink or nonregular entry');}
 for(const file of all){if(!sourceFiles.has(path.extname(file)))continue;filesChecked++;let s;
  try{s=readText(file);}catch{issues.push('Unreadable source: '+path.relative(root,file));continue;}
  for(const spec of relativeImports(s)){
   relativeImportCount++;
   const abs=path.resolve(path.dirname(file),spec);
   if(!candidateExtensions.some(ext=>regular(abs+ext)))issues.push('Unresolved relative import: '+path.relative(root,file)+' -> '+spec);
  }
  if(file.startsWith(path.join(web,'src')+path.sep)){
   if(/\bprocess\.env\b/.test(s))issues.push('Browser source references server process.env: '+path.relative(root,file));
   for(const m of s.matchAll(/\bimport\.meta\.env\.([A-Za-z_$][\w$]*)/g)){
    if(!m[1].startsWith('VITE_')&&!['DEV','PROD','MODE','BASE_URL','SSR'].includes(m[1]))issues.push('Browser source references non-public env field: '+path.relative(root,file));
   }
   if(/\bimport\.meta\.env\s*\[/.test(s))issues.push('Dynamic browser environment access requires independent review: '+path.relative(root,file));
  }
 }
 return {ok:issues.length===0,issues,filesChecked,relativeImportCount};
}
function inspectBuild(root=ROOT){
 const issues=[];const apiDir=path.join(root,'apps/api/dist');const webDir=path.join(root,'apps/web/dist');
 if(!regular(path.join(apiDir,'main.js')))issues.push('Compiled API entry apps/api/dist/main.js is missing');
 let html='';try{html=readText(path.join(webDir,'index.html'),256*1024);issues.push(...htmlPolicy(html,{built:true}));}catch{issues.push('Built web dist/index.html is missing');}
 let files=[];try{files=fileList(webDir);}catch{issues.push('Built frontend contains unsafe symlinks or nonregular files');}
 let jsFiles=0,scanned=0;const hashes={};
 for(const file of files){const rel=path.relative(webDir,file).replaceAll('\\','/');
  if(/(?:^|\/)(?:\.env(?:\..*)?|node_modules|\.git|package-lock\.json)(?:\/|$)/i.test(rel)||/\.(?:map|pem|key|p12|pfx|sqlite|db|ts|tsx|bak)$/i.test(rel))issues.push('Forbidden deployment artifact: '+rel);
  if(!/\.(?:js|css|html|json)$/i.test(file))continue;
  let s;try{s=readText(file);}catch{issues.push('Unreadable or oversized deployment file: '+rel);continue;}
  scanned++;
  hashes[rel]=crypto.createHash('sha256').update(s).digest('hex');
  if(file.endsWith('.js'))jsFiles++;
  for(const marker of secretMarkers)if(s.includes(marker))issues.push('Potential server secret marker in browser build ('+marker+'): '+rel);
 }
 if(jsFiles<1)issues.push('No compiled frontend JavaScript found');
 if(html){
  const assets=[...html.matchAll(/\b(?:src|href)=['"](\/assets\/[^'"?\s#]+)['"]/gi)].map(m=>m[1]);
  if(assets.length===0)issues.push('HTML entry does not reference built assets');
  for(const asset of assets){
   if(!/^\/assets\/[a-zA-Z0-9_.\/-]+$/.test(asset)||asset.includes('..')){issues.push('Unsafe asset path in built HTML');continue;}
   const file=path.join(webDir,asset.slice(1));
   if(!regular(file))issues.push('Broken built asset reference: '+asset);
  }
 }
 return {ok:issues.length===0,issues,filesChecked:files.length,compiledJsCount:jsFiles,textFilesScanned:scanned,sha256:hashes};
}
function run(root=ROOT,mode='--source'){
 if(!['--source','--build'].includes(mode))throw Error('Use --source or --build');
 const source=inspectSource(root);const build=mode==='--build'?inspectBuild(root):null;
 return {schema:'ASSETTRUST_V56_BUILD_ARTIFACT_GATE',mode,ok:source.ok&&(build?build.ok:true),productionApproved:false,source,build,notes:'Static preflight only. Real npm ci, compilation, live database and adversarial security tests remain mandatory.'};
}
if(require.main===module){try{const result=run(ROOT,process.argv[2]||'--source');console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}catch(e){console.error('BLOCKED: '+e.message);process.exitCode=1;}}
module.exports={regular,readText,relativeImports,htmlPolicy,inspectSource,inspectBuild,run};
