'use strict';
/** Real daemon self-check. Does not claim to prove every malware family is detected.
 * Uses harmless official EICAR synthetic test string, never customer data. */
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const ts=(()=>{try{return require('typescript')}catch{return require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'))}})();
require.extensions['.ts']=function(m,filename){const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,esModuleInterop:true}}).outputText;m._compile(js,filename)};
const Module=require('module');const old=Module._load;
Module._load=function(name,...other){if(name==='@nestjs/common')return {Injectable:()=>x=>x};return old.call(this,name,...other)};
const {ClamAvInstreamScanner}=require('../apps/api/src/contexts/document-vault/infrastructure/clamav-instream-scanner.ts');
Module._load=old;
(async()=>{
 const scanner=new ClamAvInstreamScanner();
 await scanner.scan(Buffer.from('%PDF-1.7\nAssetTrust v0.52 benign local scanner self-test\n'));
 // EICAR harmless industry-standard antivirus signature; byte fragments avoid accidental triggers on source scan.
 const testString=['X5O!P%@AP[4\\PZX54(P^)7CC)7}$','EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
 let rejected=false;
 try{await scanner.scan(Buffer.from(testString))}catch(e){if(e?.reason==='INFECTED')rejected=true;else throw e}
 if(!rejected)throw new Error('Scanner failed the synthetic EICAR detection contract');
 console.log('PASS: live ClamAV returned CLEAN for benign bytes and INFECTED for EICAR test bytes; NOT a production release approval.');
})().catch(e=>{console.error('BLOCK: ClamAV live contract failed. Verify daemon connection/signatures; no uploads may proceed.');process.exitCode=1});
