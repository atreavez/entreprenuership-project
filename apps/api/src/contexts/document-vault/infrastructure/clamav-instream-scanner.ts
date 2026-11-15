/** Local ClamAV INSTREAM transport. No command shell, third-party HTTP, or plaintext disk staging. */
import { Injectable } from '@nestjs/common';
import { createConnection } from 'node:net';
import { DOCUMENT_MALWARE_SCANNER, DocumentMalwareScanner, DocumentScanError } from '../application/malware-scanner.port';
import { MAX_UPLOAD_BYTES } from '../domain/document-policy';

export type ScannerTarget = {path:string} | {host:'127.0.0.1';port:number};
export function resolveScannerTarget(env:Record<string,string|undefined> = process.env):ScannerTarget {
 const unix=(env.CLAMAV_SOCKET_PATH||'').trim();
 const tcp=(env.CLAMAV_TCP_PORT||'').trim();
 if (unix && tcp) throw new DocumentScanError('UNAVAILABLE');
 if (unix) {
  // Do not permit relative paths, embedded NUL, control chars or unusual filenames.
  if (!/^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(unix) || unix.length>100)
   throw new DocumentScanError('UNAVAILABLE');
  return {path:unix};
 }
 // Only disposable/local CI may use loopback TCP. External scanner hosts are forbidden.
 if (tcp && env.NODE_ENV !== 'production' && /^\d{1,5}$/.test(tcp)) {
  const port=Number(tcp);
  if(port>=1 && port<=65535) return {host:'127.0.0.1',port};
 }
 throw new DocumentScanError('UNAVAILABLE');
}

export function parseClamAvVerdict(reply:Buffer):void {
 const line=reply.toString('utf8');
 if (line==='stream: OK') return;
 if (/^stream: .{1,250} FOUND$/.test(line)) throw new DocumentScanError('INFECTED');
 throw new DocumentScanError('UNAVAILABLE');
}

@Injectable()
export class ClamAvInstreamScanner implements DocumentMalwareScanner {
 async scan(bytes:Buffer, timeoutMs=15000):Promise<void> {
  if (!Buffer.isBuffer(bytes) || bytes.length<1 || bytes.length>MAX_UPLOAD_BYTES)
   throw new DocumentScanError('UNAVAILABLE');
  const target=resolveScannerTarget();
  await new Promise<void>((resolve,reject)=>{
   const socket=createConnection(target);
   let finished=false;let reply=Buffer.alloc(0);
   const deadline=setTimeout(()=>fail(),Math.max(25,Math.min(15000,timeoutMs)));
   const clean=()=>{clearTimeout(deadline);socket.destroy();};
   const finish=(err?:DocumentScanError)=>{
    if(finished)return;
    finished=true;clean();
    if(err)reject(err);else resolve();
   };
   const fail=()=>finish(new DocumentScanError('UNAVAILABLE'));
   socket.on('error',fail);
   socket.on('close',()=>{if(!finished)fail()});
   socket.on('data',(chunk:Buffer)=>{
    if(finished)return;
    if(reply.length+chunk.length>1024)return fail();
    reply=Buffer.concat([reply,chunk]);
    const end=reply.indexOf(0);
    if(end===-1)return;
    if(end!==reply.length-1)return fail();
    try{parseClamAvVerdict(reply.subarray(0,end));finish()}catch(err){finish(err instanceof DocumentScanError?err:new DocumentScanError('UNAVAILABLE'))}
   });
   socket.on('connect',()=>{
    try {
     socket.write(Buffer.from('zINSTREAM\0','ascii'));
     for(let offset=0;offset<bytes.length;offset+=65536){
      const chunk=bytes.subarray(offset,offset+65536);
      const length=Buffer.alloc(4);length.writeUInt32BE(chunk.length,0);
      socket.write(length);socket.write(chunk);
     }
     socket.write(Buffer.alloc(4));
    }catch{fail()}
   });
  });
 }
}
export {DOCUMENT_MALWARE_SCANNER};
