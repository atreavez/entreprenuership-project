/** v0.38 — tenant PDF *presentation only*. It cannot modify an issued snapshot or fixed legal warning. */
export type ReportPdfLayout={headerTitle:string;footerNote:string;accentHex:string;revision?:number};
export const DEFAULT_REPORT_LAYOUT:Readonly<ReportPdfLayout>=Object.freeze({
 headerTitle:'ASSETTRUST   /   PRIVATE EVIDENCE REPORT',
 footerNote:'CONFIDENTIAL  /  ASSETTRUST PRIVATE EVIDENCE',
 accentHex:'#123D33',revision:0
});
const prohibited=/(?:\b(?:government|official|registry[- ]certified|legal title|title deed|ownership certificate|guaranteed ownership|state[- ]approved)\b)/i;
function safeLabel(value:unknown,min:number,max:number,label:string):string{
 if(typeof value!=='string')throw Error(`${label} must be plain ASCII text`);
 const v=value.trim();
 if(v.length<min||v.length>max||/[^\x20-\x7e]|[<>\\{}()\[\]]/.test(v)||prohibited.test(v))
  throw Error(`${label} is invalid, misleading or unsafe`);
 return v;
}
/** Exact-field validation blocks prototype pollution and unknown rendering instructions. */
export function assertReportLayout(value:unknown):ReportPdfLayout{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Layout must be an object');
 const o=value as Record<string,unknown>;const names=Object.keys(o);
 if(names.length!==3||names.some(x=>!['headerTitle','footerNote','accentHex'].includes(x)))throw Error('Unexpected PDF layout field');
 const headerTitle=safeLabel(o.headerTitle,8,46,'Header title');
 const footerNote=safeLabel(o.footerNote,8,58,'Footer note');
 if(typeof o.accentHex!=='string'||!/^#[0-9a-fA-F]{6}$/.test(o.accentHex))throw Error('Accent must be a six-digit hex color');
 const accentHex=o.accentHex.toUpperCase();
 // Print contrast: an extremely light header makes white type unreadable.
 const rgb=[1,3,5].map(i=>parseInt(accentHex.slice(i,i+2),16)/255);
 const linear=rgb.map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
 const luminance=linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
 if(luminance>0.18)throw Error('PDF accent is too light for white text');
 return {headerTitle,footerNote,accentHex};
}
export function assertLayoutReason(value:unknown):string{
 if(typeof value!=='string'||value.trim().length<12||value.length>500||/[<>\x00-\x1f\x7f]/.test(value))throw Error('Reason must be 12–500 characters of plain text');
 return value.trim();
}
export function assertExpectedLayoutRevision(value:unknown):number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>1000000)throw Error('Invalid expected revision');
 return value;
}
export function assertLayoutVote(value:unknown):'APPROVE'|'REJECT'{
 if(value!=='APPROVE'&&value!=='REJECT')throw Error('Decision must be APPROVE or REJECT');return value;
}
