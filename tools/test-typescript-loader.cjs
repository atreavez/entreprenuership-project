'use strict';
/** Tests prefer workspace-installed TypeScript after `npm ci`.
 * Offline fallback uses globally installed TypeScript in isolated checkpoints. */
const path=require('node:path');
const cp=require('node:child_process');
function loadTypeScript(){
 try{return require('typescript')}
 catch(error){
  if(error?.code!=='MODULE_NOT_FOUND')throw error;
  const globalRoot=cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
  return require(path.join(globalRoot,'typescript'));
 }
}
module.exports=loadTypeScript();
