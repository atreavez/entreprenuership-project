const cp=require('node:child_process');const fs=require('node:fs');
const root=require('node:path').resolve(__dirname,'..');const output='tools/.compiled-v06';
fs.rmSync(root+'/'+output,{recursive:true,force:true});
for(const [label,cmd,args] of [
 ['Compile DDD domain and application','tsc',['--target','ES2022','--module','commonjs','--strict','--skipLibCheck','--rootDir','apps/api/src/contexts/professional-trust','--outDir',output,'apps/api/src/contexts/professional-trust/domain/trust-policy.ts','apps/api/src/contexts/professional-trust/application/trust-usecases.ts']],
 ['Run v0.6 domain, use-case and architecture regression tests',process.execPath,['--test','tools/tests-v06/*.test.cjs']]
]){
 console.log('\n'+label);const result=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',shell:label.startsWith('Run')});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
 if(result.status!==0){console.error(label+' FAILED');process.exit(result.status||1)}
}
console.log('v0.6 offline checks passed; live database/HTTP tests require the configured environment.');
