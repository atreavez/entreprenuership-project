/** Read-only, deterministic checks over one database snapshot. No repair or
 * external payment assertion. A consistent local record is not provider proof. */
export type InvoiceFacts={id:string;organizationId:string;catalogVersion:number;state:string;revision:number;totalUgx:number;currency:string;paymentKey:string|null;lines:readonly {code:string;quantity:number;unitUgx:number;totalUgx:number}[]};
export type PriceFacts={code:string;unitUgx:number;periodDays:number|null};
export type JournalFacts={revision:number;event:string;debitAccount:string;creditAccount:string;amountUgx:number};
export type SettlementFacts={providerId:string;transactionId:string;amountUgx:number;currency:string};
export type TermFacts={organizationId:string;fundingInvoiceId:string;code:string;catalogVersion:number;startsAt:number;endsAt:number};
export type FinancialSnapshot={invoice:InvoiceFacts;prices:readonly PriceFacts[];journal:readonly JournalFacts[];settlements:readonly SettlementFacts[];terms:readonly TermFacts[]};
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=1000000000;
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v);
export function supportedPurchase(items:readonly {code:string;quantity:number}[],prices:readonly PriceFacts[]):boolean{
 if(!items.length||items.some(i=>!prices.some(p=>p.code===i.code)))return false;
 const recurring=items.filter(i=>prices.some(p=>p.code===i.code&&p.periodDays!==null));
 return recurring.length===0||(items.length===1&&recurring.length===1&&recurring[0].quantity===1);
}
export function inspectFinancialSnapshot(s:FinancialSnapshot):readonly string[]{
 const i=s.invoice,issues:string[]=[];
 const seen=new Set<string>();
 const validLines=i.lines.length>0&&i.lines.every(l=>{
  const prices=s.prices.filter(p=>p.code===l.code);
  const valid=identifier(l.code)&&!seen.has(l.code)&&prices.length===1&&positive(l.unitUgx)&&prices[0].unitUgx===l.unitUgx&&
   Number.isSafeInteger(l.quantity)&&l.quantity>=1&&l.quantity<=10000&&positive(l.totalUgx)&&l.unitUgx*l.quantity===l.totalUgx;
  seen.add(l.code);return valid;
 });
 if(i.currency!=='UGX'||!positive(i.totalUgx)||!validLines||i.lines.reduce((n,l)=>n+l.totalUgx,0)!==i.totalUgx)issues.push('PRICE_SNAPSHOT_INVALID');
 const issued={revision:1,event:'ISSUED',debitAccount:'RECEIVABLE',creditAccount:'DEFERRED_SERVICE_REVENUE',amountUgx:i.totalUgx};
 const expected:JournalFacts[]=[];
 if(i.state==='ISSUED'&&i.revision===1)expected.push(issued);
 else if(i.state==='PAID'&&i.revision===2)expected.push(issued,{revision:2,event:'PAID',debitAccount:'PAYMENT_CLEARING',creditAccount:'RECEIVABLE',amountUgx:i.totalUgx});
 else if(i.state==='VOID'&&i.revision===2)expected.push(issued,{revision:2,event:'VOID',debitAccount:'DEFERRED_SERVICE_REVENUE',creditAccount:'RECEIVABLE',amountUgx:i.totalUgx});
 else if(!(i.state==='DRAFT'&&i.revision===0)&&!(i.state==='VOID'&&i.revision===1))issues.push('STATE_REVISION_INVALID');
 if(s.journal.length!==expected.length||expected.some(e=>s.journal.filter(j=>j.revision===e.revision&&j.event===e.event&&j.debitAccount===e.debitAccount&&j.creditAccount===e.creditAccount&&j.amountUgx===e.amountUgx).length!==1))issues.push('JOURNAL_MISMATCH');
 if(i.state==='PAID'){
  const p=s.settlements[0];
  if(s.settlements.length!==1||!p||!identifier(p.providerId)||!identifier(p.transactionId)||p.currency!==i.currency||p.amountUgx!==i.totalUgx||i.paymentKey!==JSON.stringify([p.providerId,p.transactionId]))issues.push('SETTLEMENT_MISMATCH');
 }else if(s.settlements.length!==0||i.paymentKey!==null)issues.push('UNEXPECTED_SETTLEMENT');
 const recurring=i.lines.filter(l=>s.prices.some(p=>p.code===l.code&&p.periodDays!==null));
 const eligible=i.state==='PAID'&&recurring.length===1&&supportedPurchase(i.lines,s.prices);
 if(i.state==='PAID'&&recurring.length>0&&!eligible)issues.push('SUBSCRIPTION_ALLOCATION_REVIEW');
 if(eligible){
  const t=s.terms[0],p=s.prices.find(x=>x.code===recurring[0].code);
  if(s.terms.length!==1||!t||!p||!Number.isSafeInteger(p.periodDays)||p.periodDays===null||p.periodDays<1||p.periodDays>366||
    t.organizationId!==i.organizationId||t.fundingInvoiceId!==i.id||t.code!==p.code||t.catalogVersion!==i.catalogVersion||
    !Number.isSafeInteger(t.startsAt)||t.startsAt<0||!Number.isSafeInteger(t.endsAt)||t.endsAt>8640000000000000||t.endsAt-t.startsAt!==p.periodDays*86400000)issues.push('SUBSCRIPTION_FUNDING_MISMATCH');
 }else if(s.terms.length!==0)issues.push('UNEXPECTED_SUBSCRIPTION');
 return Object.freeze(issues);
}
