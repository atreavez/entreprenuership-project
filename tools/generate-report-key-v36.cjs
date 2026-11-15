#!/usr/bin/env node
'use strict';
/** Generate a local Ed25519 signing key; never puts a secret in a console log or archive. */
const {generateKeyPairSync,createHash}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
if(require.main===module){
 const args=process.argv.slice(2);const dirFlag=args.indexOf('--out');const keyFlag=args.indexOf('--key-id');
 if(dirFlag===-1||keyFlag===-1||!args[dirFlag+1]||!args[keyFlag+1]){console.error('Usage: node tools/generate-report-key-v36.cjs --out <private-local-directory> --key-id <lowercase-key-id>');process.exit(2);}
 const dir=path.resolve(args[dirFlag+1]),id=args[keyFlag+1];
 if(!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(id))throw Error('Key ID must be 3–64 lowercase letters, digits, dot, dash or underscore');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const privatePath=path.join(dir,`private-report-key-${id}.txt`),publicPath=path.join(dir,`trusted-report-public-keys-${id}.json`);
 if(fs.existsSync(privatePath)||fs.existsSync(publicPath))throw Error('Refusing to overwrite an existing signing key or trust document');
 const pair=generateKeyPairSync('ed25519');
 const privateDer=pair.privateKey.export({format:'der',type:'pkcs8'}),publicDer=pair.publicKey.export({format:'der',type:'spki'});
 const trusted={[id]:publicDer.toString('base64')};
 fs.writeFileSync(privatePath,privateDer.toString('base64')+'\n',{mode:0o600,flag:'wx'});
 fs.writeFileSync(publicPath,JSON.stringify(trusted,null,2)+'\n',{mode:0o644,flag:'wx'});
 console.log('Signing key created; private key was NOT printed.');
 console.log('PRIVATE KEY (keep secret): '+privatePath);
 console.log('PINNED PUBLIC TRUST FILE (verify distribution independently): '+publicPath);
 console.log('Set ASSETTRUST_REPORT_SIGNING_KEY_ID='+id);
 console.log('Set ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64 to the CONTENTS of the private key file (without newline).');
 console.log('Public key SHA-256 fingerprint: '+createHash('sha256').update(publicDer).digest('hex'));
}
