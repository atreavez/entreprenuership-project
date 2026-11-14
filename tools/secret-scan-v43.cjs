'use strict';
/** High-confidence repository secret preflight. Not a replacement for a professional secret scanner.
 * Output never includes secret matches. --history requires a full local Git repository.
 */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const PATTERNS=[
 ['PRIVATE_KEY',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
 ['AWS_ACCESS_KEY',/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
 ['GITHUB_TOKEN',/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{24,}\b|\bgithub_pat_[A-Za-z0-9_]{24,}\b/],
 ['STRIPE_LIVE',/\b(?:sk_live|rk_live)_[A-Za-z0-9]{16,}\b/],
 ['SLACK_TOKEN',/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
 ['GOOGLE_API_KEY',/\bAIza[0-9A-Za-z_-]{35}\b/],
 ['NPM_TOKEN',/\bnpm_[A-Za-z0-9]{30,}\b/]
];
const BAD_NAMES=/(^|\/)(?:\.env(?:\.(?!example$)[^/]*)?|id_rsa|id_ed25519|credentials\.json|service-account[^/]*\.json|.*\.pem|.*\.p12|.*\.pfx)$/i;
const EXCLUDED=new Set(['.git','node_modules','dist','coverage','.cache']);
function matches(buffer,name){
 const flags=[];
 if(BAD_NAMES.test(name) && !name.endsWith('.env.example'))flags.push('SENSITIVE_FILENAME');
 if(buffer.length>2*1024*1024)return flags; // size cap is reported separately during strict history scanning
 if(buffer.includes(0))return flags;
 const value=buffer.toString('utf8');
 for(const [kind,regex] of PATTERNS)if(regex.test(value))flags.push(kind);
 return flags;
}
function scanWorkingTree(root=ROOT){
 const issues=[];let files=0;
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const absolute=path.join(dir,entry.name),relative=path.relative(root,absolute).replaceAll(path.sep,'/');
   if(entry.isSymbolicLink()){issues.push({source:'tree',location:relative,type:'SYMLINK_UNREVIEWED'});continue;}
   if(entry.isDirectory()){if(!EXCLUDED.has(entry.name))walk(absolute);continue;}
   if(!entry.isFile())continue;
   if(/\.(zip|gz|png|jpe?g|webp|woff2?|mp4|pdf|mbtiles|sqlite|db)$/i.test(entry.name))continue;
   const stat=fs.statSync(absolute);files++;
   if(stat.size>2*1024*1024){issues.push({source:'tree',location:relative,type:'LARGE_FILE_REVIEW_REQUIRED'});continue;}
   for(const type of matches(fs.readFileSync(absolute),relative))issues.push({source:'tree',location:relative,type});
 }}walk(root);
 return {files,issues};
}
const {scanGitHistoryBatched}=require('./git-history-batch-v54.cjs');
function scanGitHistory(root=ROOT){return scanGitHistoryBatched(root,matches);}
function run(root=ROOT,withHistory=false){
 const snapshot=scanWorkingTree(root);const history=withHistory?scanGitHistory(root):null;
 const passed=snapshot.issues.length===0 && (!withHistory || (history.complete && history.issues.length===0));
 return {schema:'ASSETTRUST_HIGH_CONFIDENCE_SECRET_SCAN_V43',passed,snapshot,history,warning:'Limited patterns: independent gitleaks/trufflehog scan and manual credential rotation remain mandatory; never interpret this scan as proof of no secrets.'};
}
function parseCli(args){
 let root=ROOT,history=false,repoSeen=false;
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--history'){if(history)throw Error('Duplicate --history option');history=true;continue;}
  if(arg==='--repo'){
   if(repoSeen||i+1>=args.length||args[i+1].startsWith('--'))throw Error('Provide exactly one repository path after --repo');
   repoSeen=true;root=fs.realpathSync(path.resolve(args[++i]));
   if(!fs.statSync(root).isDirectory())throw Error('Repository path must be a directory');
   continue;
  }
  throw Error('Unsupported scan argument; use --history and optionally --repo <path>');
 }
 return {root,history};
}
if(require.main===module){
 try{
  const options=parseCli(process.argv.slice(2));
  const result=run(options.root,options.history);
  console.log(JSON.stringify(result,null,2));
  if(!result.passed)process.exitCode=1;
 }catch(error){console.error('BLOCKED: Invalid or inaccessible scan target');process.exitCode=1;}
}
module.exports={matches,scanWorkingTree,scanGitHistory,run,parseCli};
