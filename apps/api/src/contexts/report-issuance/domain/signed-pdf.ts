/** AssetTrust v0.37. Minimal, no-third-party, offline-verifiable A4 PDF evidence rendering.
 * This is NOT PAdES, an official record or a legal title certificate.
 * Keep the domain independent of frameworks, I/O and infrastructure.
 */
import {createHash,sign as edSign,verify as edVerify,timingSafeEqual} from 'node:crypto';
import {type BundlePayload,assertBundlePayload,importPrivateSigningKey,importPublicSigningKey} from './signed-attestation';
import {canonicalSnapshot,REPORT_NOTICE} from './report-policy';
import type {ReportPdfLayout} from './report-layout-policy';

export const PDF_RECEIPT_SCHEMA='ASSETTRUST_DETACHED_PDF_RECEIPT_V1' as const;
export const PDF_RECEIPT_CONTEXT='ASSETTRUST-DETACHED-PDF-RECEIPT-V1\n';
export type PdfReceiptPayload={schema:typeof PDF_RECEIPT_SCHEMA;reportId:string;issuedAt:string;exportedAt:string;statusAtExport:string;snapshotSha256:string;pdfSha256:string;renderProfile:'ASSETTRUST_A4_ASCII_V1';verificationPath:string;notice:string};
export type SignedPdfReceipt={schema:typeof PDF_RECEIPT_SCHEMA;algorithm:'Ed25519';keyId:string;payload:PdfReceiptPayload;signatureBase64:string};
const sha=(input:Buffer)=>createHash('sha256').update(input).digest('hex');
const hex64=/^[0-9a-f]{64}$/;
const keyIdRx=/^[a-z0-9][a-z0-9._-]{2,63}$/;
const STATUS=['ISSUED','UNDER_REVIEW','SUPERSEDED','WITHDRAWN'];

/** ASCII-only standard PDF fonts. Unknown Unicode is visibly substituted with '?' rather than injecting PDF markup. */
function safeText(value:unknown):string{
 const input=String(value??'');
 if(input.length>25000)throw Error('Report field too long for printable PDF');
 return input.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\r\n\t]+/g,' ').replace(/[^\x20-\x7E]/g,'?');
}
function pdfEscape(s:string){return s.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');}
// Conservative Helvetica metrics used for line splitting. A deliberately low bound avoids edge clipping.
function glyphWidth(c:string){return /[MWm@#%]/.test(c)?11.2:/[w]/.test(c)?9.0:/[ilI!|.,:'` ]/.test(c)?3.4:/[A-Z0-9]/.test(c)?7.5:6.7;}
function wrapText(text:string,maxPt:number,size:number):string[]{
 const s=safeText(text);const words=s.split(/\s+/).filter(Boolean);if(!words.length)return [''];
 const lines:string[]=[];let line='';let width=0;
 for(const word of words){
  const pushWord=(part:string)=>{const w=[...part].reduce((sum,c)=>sum+glyphWidth(c)*size/11,0);if(line&&width+glyphWidth(' ')*size/11+w>maxPt){lines.push(line);line='';width=0;}
   if(line){line+=' ';width+=glyphWidth(' ')*size/11;}line+=part;width+=w;};
  let chunk='';for(const c of word){const test=chunk+c;const w=[...test].reduce((n,x)=>n+glyphWidth(x)*size/11,0);
   if(chunk&&w>maxPt){pushWord(chunk);lines.push(line);line='';width=0;chunk=c;}else{chunk=test;}}
  if(chunk)pushWord(chunk);
 }
 if(line)lines.push(line);return lines;
}
const PAGE_W=595.28,PAGE_H=841.89,LEFT=48,RIGHT=48,CONTENT=PAGE_W-LEFT-RIGHT;
/** Reject structurally impossible reports instead of silently omitting evidence. */
function readSnapshot(payload:BundlePayload){
 const s=payload.snapshot as Record<string,unknown>;
 if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Report snapshot not printable');
 if(!Array.isArray(s.evidence)||s.evidence.length>1000)throw Error('Report evidence list is not printable');
 return {s,evidence:s.evidence as Record<string,unknown>[]};
}
export function renderPrivateReportPdf(payload:BundlePayload,layout?:ReportPdfLayout):Buffer{
 assertBundlePayload(payload);
 // Layout is approved separately from evidence. Validate even if an internal caller bypasses the admin policy.
 if(layout){
  if(!/^#[0-9A-Fa-f]{6}$/.test(layout.accentHex)|| !/^[\x20-\x7e]{8,46}$/.test(layout.headerTitle)||!/^[\x20-\x7e]{8,58}$/.test(layout.footerNote))
   throw Error('Invalid PDF layout');
 }
 const headerTitle=layout?.headerTitle??'ASSETTRUST   /   PRIVATE EVIDENCE REPORT';
 const footerNote=layout?.footerNote??'CONFIDENTIAL  /  ASSETTRUST PRIVATE EVIDENCE';
 const rgb=layout?[1,3,5].map(i=>parseInt(layout.accentHex.slice(i,i+2),16)/255):[0.07,0.24,0.20];
 const accent=rgb.map(v=>v.toFixed(3)).join(' ');
 const {s,evidence}=readSnapshot(payload);
 const pages:string[][]=[[]];let y=PAGE_H-123;
 const current=()=>pages[pages.length-1];
 const pageBreak=()=>{if(pages.length>=150)throw Error('Report PDF exceeds 150 pages');pages.push([]);y=PAGE_H-123;};
 const line=(value:unknown,style:'normal'|'strong'|'small'='normal',indent=0)=>{
  const size=style==='strong'?11:style==='small'?8.5:10;
  const lines=wrapText(String(value??''),CONTENT-indent-5,size);
  for(const row of lines){if(y<83)pageBreak();const x=LEFT+indent;const font=style==='strong'?'F2':'F1';
   current().push(`BT /${font} ${size} Tf 0.12 0.18 0.18 rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(row)}) Tj ET`);y-=size+5;}
 };
 const space=(n=8)=>{if(y-n<83)pageBreak();else y-=n;};
 const field=(label:string,value:unknown)=>{line(label,'strong');line(value,'normal',11);space(6)};
 line('REPORT DETAILS','strong');
 field('Reference',payload.reportId);field('Issuing organization',s.organizationName??'(not provided)');
 field('Case code',s.caseCode??'(not provided)');field('Internal case ID',s.caseId??'(not provided)');
 field('Asset reference',s.assetCode??'(not provided)');field('Internal asset ID',s.assetId??'(not provided)');
 field('Originally issued (UTC)',payload.issuedAt);field('PDF exported (UTC)',payload.exportedAt);
 field('Status when exported',payload.statusAtExport);
 field('Original evidence snapshot SHA-256',payload.snapshotSha256);
 field('Public status check path',payload.verificationPath);
 if(layout?.revision!==undefined)field('PDF presentation layout revision',layout.revision);
 field('Report classification',s.legalStatus??'(not supplied)');
 field('Assurance classification',s.assurance??'(not supplied)');
 field('Summary template origin / revision',`${safeText(s.templateSource??'(unknown)')} / ${safeText(s.templateRevision??'(unknown)')}`);
 space(5);line('REVIEW SUMMARY','strong');line(s.summary??'(not supplied)');space(12);
 if(y<205)pageBreak(); // Keep the evidence section heading with its first entry.
 line('EVIDENCE RECORDS','strong');space(3);
 if(!evidence.length)line('No evidence rows recorded in this snapshot.');
 for(let i=0;i<evidence.length;i++){
  const e=evidence[i];if(!e||typeof e!=='object'||Array.isArray(e))throw Error('Invalid evidence entry');
  if(y<195)pageBreak();space(8);line(`Evidence ${i+1} of ${evidence.length}: ${safeText(e.stage??'Stage unknown')} / ${safeText(e.type??'Type unknown')}`,'strong');
  if(e.id!==undefined)line(`Evidence ID: ${safeText(e.id)}`,'small',11);
  for(const [key,caption] of [['sourceName','Source'],['reference','Reference'],['observations','Observations'],['recordedBy','Recorded by'],['reviewedBy','Independently reviewed by']] as const){
   line(`${caption}: ${safeText(e[key]??'(not supplied)')}`,'normal',11);
  }
 }
 space(14);line('LIMITATIONS AND RECHECK','strong');line(payload.statusNotice);
 line('This document is a confidential printable rendering of non-official evidence. Its original data is the immutable issued snapshot. The PDF has a separate cryptographic receipt; no PDF-native signature is embedded.');
 line(REPORT_NOTICE);
 line('ASCII font support: characters outside supported Latin/ASCII are displayed as ? in this printable rendering. Consult the original signed JSON evidence if exact wording is important.','small');
 // PDF object assembly: deterministic objects, no JavaScript, hyperlinks, attachments, interactive forms or external services.
 const objects:string[]=[];const add=(s:string)=>{objects.push(s);return objects.length};
 const catalog=add(''),root=add(''),regular=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 const pageRefs:number[]=[];
 for(let i=0;i<pages.length;i++){
  const commands:string[]=[];
  commands.push(`${accent} rg 0 793 595.28 49 re f`);
  commands.push(`BT /F2 14 Tf 1 1 1 rg 1 0 0 1 48 812 Tm (${pdfEscape(safeText(headerTitle))}) Tj ET`);
  commands.push(`BT /F2 9.5 Tf 0.65 0.13 0.13 rg 1 0 0 1 48 777 Tm (NOT AN OFFICIAL LAND TITLE OR OWNERSHIP CERTIFICATE) Tj ET`);
  commands.push(`BT /F1 9 Tf 0.1 0.2 0.2 rg 1 0 0 1 48 757 Tm (${pdfEscape(safeText('Status at export: '+payload.statusAtExport+'    |    VERIFY LIVE STATUS BEFORE RELYING'))}) Tj ET`);
  commands.push(...pages[i]);
  commands.push('0.7 0.72 0.69 RG 0.7 w 48 68 m 547 68 l S');
  commands.push(`BT /F1 8 Tf 0.30 0.35 0.35 rg 1 0 0 1 48 53 Tm (${pdfEscape(safeText(footerNote))}  /  Page ${i+1} of ${pages.length}) Tj ET`);
  const content=commands.join('\n')+'\n';const contentNo=add(`<< /Length ${Buffer.byteLength(content,'ascii')} >>\nstream\n${content}endstream`);
  const pageNo=add(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${contentNo} 0 R >>`);
  pageRefs.push(pageNo);
 }
 objects[root-1]=`<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.map(n=>n+' 0 R').join(' ')}] >>`;
 objects[catalog-1]=`<< /Type /Catalog /Pages ${root} 0 R >>`;
 let output='%PDF-1.4\n%AssetTrust\n';const offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(output,'ascii'));output+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(output,'ascii');
 output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(let i=1;i<offsets.length;i++)output+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 output+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 const pdf=Buffer.from(output,'ascii');
 if(pdf.length>3*1024*1024)throw Error('Report PDF exceeds 3MB export safety limit');return pdf;
}
export function assertReceiptPayload(payload:unknown):asserts payload is PdfReceiptPayload{
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid PDF receipt payload');
 const p=payload as Record<string,unknown>;
 const required=['schema','reportId','issuedAt','exportedAt','statusAtExport','snapshotSha256','pdfSha256','renderProfile','verificationPath','notice'];
 if(Object.keys(p).length!==required.length||Object.keys(p).some(x=>!required.includes(x)))throw Error('Unexpected PDF receipt field');
 if(p.schema!==PDF_RECEIPT_SCHEMA||p.renderProfile!=='ASSETTRUST_A4_ASCII_V1'||p.notice!==REPORT_NOTICE)throw Error('Invalid receipt schema or legal notice');
 if(typeof p.reportId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.reportId))throw Error('Invalid PDF report ID');
 if(typeof p.issuedAt!=='string'||typeof p.exportedAt!=='string'||![p.issuedAt,p.exportedAt].every(x=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x))))throw Error('Invalid receipt timestamps');
 if(typeof p.statusAtExport!=='string'||!STATUS.includes(p.statusAtExport)||p.verificationPath!==`/#verify/report/${p.reportId}`)throw Error('Invalid receipt status or verification path');
 if(typeof p.snapshotSha256!=='string'||typeof p.pdfSha256!=='string'||!hex64.test(p.snapshotSha256)||!hex64.test(p.pdfSha256))throw Error('Invalid receipt fingerprint');
}
export function signPdfReceipt(payload:BundlePayload,pdf:Buffer,keyId:string,privateDerB64:string):SignedPdfReceipt{
 assertBundlePayload(payload);if(!Buffer.isBuffer(pdf)||pdf.length<100||pdf.length>3*1024*1024||pdf.subarray(0,8).toString()!=='%PDF-1.4')throw Error('Invalid generated report PDF');
 if(!keyIdRx.test(keyId))throw Error('Invalid signing key ID');
 const body:PdfReceiptPayload={schema:PDF_RECEIPT_SCHEMA,reportId:payload.reportId,issuedAt:payload.issuedAt,exportedAt:payload.exportedAt,statusAtExport:payload.statusAtExport,snapshotSha256:payload.snapshotSha256,pdfSha256:sha(pdf),renderProfile:'ASSETTRUST_A4_ASCII_V1',verificationPath:payload.verificationPath,notice:REPORT_NOTICE};
 const sig=edSign(null,Buffer.from(PDF_RECEIPT_CONTEXT+canonicalSnapshot(body),'utf8'),importPrivateSigningKey(privateDerB64));
 return {schema:PDF_RECEIPT_SCHEMA,algorithm:'Ed25519',keyId,payload:body,signatureBase64:sig.toString('base64')};
}
export function verifyPdfReceipt(pdf:Buffer,receipt:unknown,trustedKeys:Record<string,string>){
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))throw Error('Invalid PDF receipt');
 const x=receipt as Record<string,unknown>;
 if(Object.keys(x).length!==5||Object.keys(x).some(y=>!['schema','algorithm','keyId','payload','signatureBase64'].includes(y))||x.schema!==PDF_RECEIPT_SCHEMA||x.algorithm!=='Ed25519')throw Error('Unsupported PDF receipt');
 if(typeof x.keyId!=='string'||!keyIdRx.test(x.keyId)||!Object.prototype.hasOwnProperty.call(trustedKeys,x.keyId))throw Error('PDF receipt key not trusted');
 assertReceiptPayload(x.payload);
 if(!Buffer.isBuffer(pdf)||pdf.length<100||pdf.length>3*1024*1024)throw Error('Invalid PDF bytes');
 const actual=Buffer.from(sha(pdf),'hex'),expected=Buffer.from(x.payload.pdfSha256,'hex');
 if(!timingSafeEqual(actual,expected))throw Error('PDF has been modified');
 const sig=x.signatureBase64;
 if(typeof sig!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(sig)||Buffer.from(sig,'base64').toString('base64')!==sig)throw Error('Invalid PDF receipt signature encoding');
 if(!edVerify(null,Buffer.from(PDF_RECEIPT_CONTEXT+canonicalSnapshot(x.payload),'utf8'),importPublicSigningKey(trustedKeys[x.keyId]),Buffer.from(sig,'base64')))throw Error('Invalid PDF receipt signature');
 return {ok:true,reportId:x.payload.reportId,statusAtExport:x.payload.statusAtExport,keyId:x.keyId,pdfSha256:x.payload.pdfSha256};
}
