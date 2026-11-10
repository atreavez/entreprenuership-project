const cp=require('node:child_process');const path=require('node:path');const root=path.resolve(__dirname,'..');
const result=cp.spawnSync(process.execPath,['--test','tools/tests-v07/*.test.cjs'],{cwd:root,shell:true,encoding:'utf8'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.status!==0)process.exit(result.status||1);
console.log('v0.7 document encryption offline checks passed. HTTP/PostgreSQL integration remains a separate release gate.');
