const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..');
const compiler=cp.spawnSync('tsc',['--target','ES2022','--module','commonjs','--strict','--skipLibCheck','--outDir','tools/.compiled-v04',
 'apps/api/src/contexts/verification/domain/evidence-policy.ts','apps/api/src/contexts/verification/application/evidence-workflow.ts'],{cwd:root,encoding:'utf8'});
if(compiler.status!==0){console.error('TypeScript compilation failed:\n'+compiler.stdout+compiler.stderr);process.exit(1)}
const result=cp.spawnSync(process.execPath,['--test','tools/tests-v04/workflow.test.cjs'],{cwd:root,encoding:'utf8'});
process.stdout.write(result.stdout);process.stderr.write(result.stderr);if(result.status!==0)process.exit(result.status||1);
const b=cp.spawnSync(process.execPath,['tools/verify-v04-architecture.cjs'],{cwd:root,encoding:'utf8'});
process.stdout.write(b.stdout);process.stderr.write(b.stderr);if(b.status!==0)process.exit(b.status||1);
