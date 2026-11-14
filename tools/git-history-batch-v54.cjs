'use strict';
/**
 * Efficient, fail-closed review of reachable Git blobs, commit messages and
 * annotated tags. Includes locally retained reflog commits, not just branch
 * tips. No secret bytes or file contents are returned or logged.
 *
 * This is high-confidence pattern screening, not a substitute for Gitleaks,
 * TruffleHog, full repository provenance or rotation of leaked credentials.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const LIMITS = Object.freeze({maxObjects: 250000, maxObjectBytes: 2 * 1024 * 1024, maxTotalBytes: 1024 * 1024 * 1024});
const HEX = /^[a-f\d]{40,64}$/i;

function git(root,args,options={}) {
 const result=cp.spawnSync('git',args,{
  cwd:root,encoding:options.encoding==='buffer'?undefined:(options.encoding||'utf8'),input:options.input,
  maxBuffer:options.maxBuffer||128*1024*1024,timeout:120000,shell:false,
 });
 if(result.error||result.signal||result.status!==0)throw Error('Git history read failed or exceeded its safety limit');
 return result.stdout;
}
function unavailable(reason,objects=0,issues=[]) {
 return {complete:false,reason,objects,scannedBytes:0,issues};
}
function scanGitHistoryBatched(root, classify,limits=LIMITS) {
 if(typeof classify!=='function')throw TypeError('A secret classifier is required');
 if(!fs.existsSync(path.join(root,'.git')))return unavailable('No .git metadata in archive');
 try {
  if(git(root,['rev-parse','--is-inside-work-tree']).trim()!=='true')return unavailable('Not an active Git working tree');
  const top=fs.realpathSync(git(root,['rev-parse','--show-toplevel']).trim());
  if(top!==fs.realpathSync(root))return unavailable('Scan must run from the repository root');
  if(git(root,['rev-parse','--is-shallow-repository']).trim()!=='false')return unavailable('History is shallow; fetch all refs and required history');
  // --reflog includes locally retained orphaned commits, deleted branch tips
  // and resets that are absent from --all alone. Expired reflogs/unreachable
  // pruned objects cannot be reliably recovered from the local repository.
  const output=git(root,['rev-list','--all','--reflog','--objects']);
  const paths=new Map();
  for(const line of output.split('\n')) {
   if(!line)continue;
   const match=/^([a-f\d]{40,64})(?: (.*))?$/.exec(line);
   if(!match)return unavailable('Git object listing has an unexpected format');
   const oid=match[1];
   if(!paths.has(oid))paths.set(oid,new Set());
   if(match[2])paths.get(oid).add(match[2]);
   if(paths.size>limits.maxObjects)return unavailable('Git object count exceeds configured complete-scan limit');
  }
  const oids=[...paths.keys()];
  if(oids.length===0)return unavailable('No Git objects found; cannot establish history coverage');
  const checks=git(root,['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],{input:oids.join('\n')+'\n'});
  const meta=checks.trimEnd().split('\n');
  if(meta.length!==oids.length)return unavailable('Batch metadata count mismatch');
  const selected=[];const issues=[];
  let objects=0,total=0;
  for(let i=0;i<oids.length;i++) {
   const fields=/^([a-f\d]{40,64}) (blob|commit|tag|tree) (\d+)$/.exec(meta[i]);
   if(!fields||fields[1]!==oids[i])return unavailable('Batch metadata failed verification');
   const type=fields[2],size=Number(fields[3]),oid=oids[i];
   if(!['blob','commit','tag'].includes(type))continue;
   objects++;
   if(!Number.isSafeInteger(size))return unavailable('Git object size is invalid');
   if(size>limits.maxObjectBytes){issues.push({source:'git',location:oid.slice(0,12),type:'LARGE_OBJECT_REVIEW_REQUIRED'});continue;}
   total+=size;
   if(total>limits.maxTotalBytes)return unavailable('Git history exceeds complete-scan byte budget',objects,issues);
   selected.push({oid,type,size,names:[...paths.get(oid)]});
  }
  let offset=0;
  while(offset<selected.length) {
   // Restrict buffered output to an independently bounded group. One invocation
   // per ~4MiB batch, not three invocations per object as in v0.43.
   const group=[];let bytes=0;
   while(offset<selected.length && (group.length===0 || bytes + selected[offset].size + 128<=4*1024*1024)) {
    const next=selected[offset++];group.push(next);bytes+=next.size+128;
   }
   const answer=git(root,['cat-file','--batch'],{
    input:group.map(item=>item.oid).join('\n')+'\n',encoding:'buffer',maxBuffer:8*1024*1024,
   });
   if(!Buffer.isBuffer(answer))return unavailable('Git batch content was not binary safe',objects,issues);
   let cursor=0;
   for(const item of group) {
    const end=answer.indexOf(0x0a,cursor);
    if(end<0)return unavailable('Incomplete Git batch header',objects,issues);
    const header=answer.subarray(cursor,end).toString('ascii');
    const match=/^([a-f\d]{40,64}) (blob|commit|tag) (\d+)$/.exec(header);
    if(!match||match[1]!==item.oid||match[2]!==item.type||Number(match[3])!==item.size)
     return unavailable('Git batch content header mismatch',objects,issues);
    const start=end+1,stop=start+item.size;
    if(stop>=answer.length||answer[stop]!==0x0a)return unavailable('Git batch content truncated',objects,issues);
    const content=answer.subarray(start,stop);
    cursor=stop+1;
    for(const name of item.names.length?item.names:['']) {
     const flags=classify(content,name);
     if(!Array.isArray(flags))return unavailable('Secret classifier returned unexpected output',objects,issues);
     for(const type of flags)issues.push({source:'git',location:item.oid.slice(0,12),type});
    }
   }
   if(cursor!==answer.length)return unavailable('Unexpected trailing Git batch data',objects,issues);
  }
  return {
   complete:true,reason:null,objects,scannedBytes:total,issues,
   scope:'All refs and retained local reflogs; expired/pruned unreachable objects are not recoverable',
  };
 }catch(error){return unavailable('Git history inspection could not finish safely');}
}
module.exports={scanGitHistoryBatched,LIMITS};
