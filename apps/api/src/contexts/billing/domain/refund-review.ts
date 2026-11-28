export type RefundRequestInput=Readonly<{invoiceId:string;adjustmentId:string;amountUgx:number;reason:string}>;
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const reason=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>=12&&v.length<=500&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
const money=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=1000000000;
export function parseRefundRequest(v:unknown):RefundRequestInput{
 if(!exact(v,['invoiceId','adjustmentId','amountUgx','reason'])||!uuid(v.invoiceId)||typeof v.adjustmentId!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v.adjustmentId)||!money(v.amountUgx)||!reason(v.reason))throw Error('Invalid refund review request');
 return Object.freeze({invoiceId:v.invoiceId,adjustmentId:v.adjustmentId,amountUgx:v.amountUgx,reason:v.reason.trim()});
}
export function parseRefundDecision(v:unknown):Readonly<{decision:'APPROVE'|'REJECT';reason:string}>{
 if(!exact(v,['decision','reason'])||(v.decision!=='APPROVE'&&v.decision!=='REJECT')||!reason(v.reason))throw Error('Invalid refund decision');
 return Object.freeze({decision:v.decision,reason:v.reason.trim()});
}
export function canApproveRefund(submittedBy:string,reviewer:string,total:number,reversed:number,reserved:number,requested:number):boolean{
 return uuid(submittedBy)&&uuid(reviewer)&&submittedBy!==reviewer&&money(total)&&money(requested)&&
 Number.isSafeInteger(reversed)&&reversed>=0&&Number.isSafeInteger(reserved)&&reserved>=0&&reversed<=total&&reserved<=total-reversed&&requested<=total-reversed-reserved;
}
