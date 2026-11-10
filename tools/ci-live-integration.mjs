/** Supervises the real NestJS HTTP test run and always stops its child server. */
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,openSync,closeSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareIsolatedRunEnvironment,waitForOwnedApiReady} from './ci-runner-policy.mjs';
const {origin,env:runEnvironment}=prepareIsolatedRunEnvironment(process.env);
const dir=mkdtempSync(join(tmpdir(),'assettrust-v13-integration-'));
const logfile=join(dir,'api.log');
const output=openSync(logfile,'w');
const server=spawn('npm',['run','start','--workspace','apps/api'],{
 stdio:['ignore',output,output],detached:process.platform!=='win32',env:runEnvironment
});
closeSync(output);
let startFailure=null;
server.on('error',error=>{startFailure=error});
let stopped=false;
function stop(){
 if(stopped)return;
 stopped=true;
 try{if(process.platform!=='win32')process.kill(-server.pid,'SIGTERM');else server.kill('SIGTERM')}catch{}
}
process.once('SIGINT',()=>{stop();process.exitCode=130});
process.once('SIGTERM',()=>{stop();process.exitCode=143});
try{
 await waitForOwnedApiReady(origin,runEnvironment,{isChildAlive:()=>!startFailure&&server.exitCode===null&&server.signalCode===null&&!server.killed});
 const suites=['test:e2e:local','test:e2e:identity','test:e2e:geo','test:e2e:overlaps'];
 for(const [index,suite] of suites.entries()){
  if(index>0){
   console.log('Waiting 65 seconds for the previous rate-limit window to expire...');
   await new Promise(resolve=>setTimeout(resolve,65000));
  }
  console.log(`Running ${suite} against validated disposable test API`);
  const child=spawnSync('npm',['run',suite],{stdio:'inherit',env:runEnvironment,timeout:240000});
  if(child.status!==0)throw Error(`${suite} failed (exit ${child.status??'signal'}).`);
 }
 console.log('PASS: four HTTP/PostgreSQL integration suites completed.');
}catch(error){
 console.error('FAIL: '+error.message);
 // Only emit bounded logs with credentials redacted, never a raw configuration dump.
 try{
  let excerpt=readFileSync(logfile,'utf8').split('\n').slice(-75).join('\n');
  for(const secret of [process.env.JWT_SECRET,process.env.MFA_ENCRYPTION_KEY,...Object.values(JSON.parse(runEnvironment.DOCUMENT_ENCRYPTION_KEYS||'{}'))]){
   if(typeof secret==='string'&&secret.length>8)excerpt=excerpt.split(secret).join('[REDACTED]');
  }
  console.error('Recent API log (redacted):\n'+excerpt.slice(-5500));
 }catch{}
 process.exitCode=1;
}finally{
 stop();
 rmSync(dir,{recursive:true,force:true});
}
