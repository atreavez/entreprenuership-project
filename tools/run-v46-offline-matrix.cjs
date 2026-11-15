'use strict';
// Offline regression runner. Every version command must execute; no fail-open skips.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-evidence','v46');fs.mkdirSync(out,{recursive:true});
const scripts=require(path.join(root,'package.json')).scripts;
const first=Number(process.env.V46_FIRST||3),last=Number(process.env.V46_LAST||46);
if(!Number.isInteger(first)||!Number.isInteger(last)||first<3||last>46||first>last)throw Error('Invalid matrix range');
const commands=Array.from({length:last-first+1},(_,i)=>`verify:v${String(i+first).padStart(2,'0')}`);
commands.push('verify:architecture','verify:syntax','verify:ci:v41');
const results=[];
for(const command of commands){
 const result=spawnSync('npm',['run',command],{cwd:root,encoding:'utf8',timeout:70000,maxBuffer:1024*1024*16});
 const log=(result.stdout||'')+(result.stderr||'');
 fs.writeFileSync(path.join(out,command.replace(/:/g,'-')+'.log'),log);
 const matches=[...log.matchAll(/# tests\s+(\d+)/g)];
 const testCount=matches.reduce((sum,m)=>sum+Number(m[1]),0);
 const hasTestRunner=/\bnode\s+--test\b/.test(scripts[command]);
 const passed=result.status===0&&log.trim().length>0&&(!hasTestRunner||testCount>0);
 results.push({command,passed,exit:result.status,testCount});
 console.log(`${passed?'PASS':'FAIL'} ${command}${testCount?' ('+testCount+' tests)':''}`);
}
fs.writeFileSync(path.join(out,'matrix.json'),JSON.stringify(results,null,2)+'\n');
const failures=results.filter(x=>!x.passed);console.log(`RESULT ${results.length-failures.length}/${results.length} commands passed`);
if(failures.length){console.error('FAILURES:',failures.map(x=>x.command).join(', '));process.exitCode=1}
