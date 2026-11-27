/** Pure commercial rules. UGX integer amounts, no provider or database dependencies. */
export type Price=Readonly<{code:string;unitUgx:number;periodDays:number|null}>;
export type Catalog=Readonly<{version:number;prices:readonly Price[]}>;
export type Line=Readonly<{code:string;quantity:number;unitUgx:number;totalUgx:number}>;
export type Invoice=Readonly<{
 id:string;organizationId:string;catalogVersion:number;lines:readonly Line[];totalUgx:number;
 currency:'UGX';state:'DRAFT'|'ISSUED'|'PAID'|'VOID';revision:number;paymentKey:string|null;
}>;
export type LedgerEntry=Readonly<{account:'RECEIVABLE'|'DEFERRED_SERVICE_REVENUE'|'PAYMENT_CLEARING';debit:number;credit:number}>;
export type Transition=Readonly<{invoice:Invoice;entries:readonly LedgerEntry[]}>;
const MAX=1_000_000_000;
function integer(v:unknown,min:number,max:number):v is number{return typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;}
function id(v:unknown):v is string{return typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v);}
function uuid(v:unknown):v is string{return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
}
export function validateCatalog(input:unknown):Catalog{
 if(!exact(input,['version','prices'])||!integer(input.version,1,2147483647)||!Array.isArray(input.prices)||input.prices.length<1||input.prices.length>100)throw Error('Invalid price catalog');
 const seen=new Set<string>();
 const prices=input.prices.map(p=>{
  if(!exact(p,['code','unitUgx','periodDays'])||!id(p.code)||seen.has(p.code)||!integer(p.unitUgx,1,MAX)||(p.periodDays!==null&&!integer(p.periodDays,1,366)))throw Error('Invalid catalog price');
  seen.add(p.code);return Object.freeze({code:p.code,unitUgx:p.unitUgx,periodDays:p.periodDays as number|null});
 });
 return Object.freeze({version:input.version,prices:Object.freeze(prices)});
}
/** The caller supplies only product code and quantity. Prices are resolved from
 * an approved catalog loaded by the server, never from checkout input. */
export function draftInvoice(invoiceId:string,organizationId:string,catalogInput:unknown,expectedVersion:number,items:unknown):Invoice{
 const catalog=validateCatalog(catalogInput);
 if(!uuid(invoiceId)||!uuid(organizationId)||catalog.version!==expectedVersion||!Array.isArray(items)||items.length<1||items.length>100)throw Error('Invalid invoice request or stale catalog');
 let total=0;const seen=new Set<string>();
 const lines=items.map(item=>{
  if(!exact(item,['code','quantity'])||!id(item.code)||seen.has(item.code)||!integer(item.quantity,1,10000))throw Error('Invalid invoice line');
  const price=catalog.prices.find(p=>p.code===item.code);
  if(!price)throw Error('Unknown catalog item');
  seen.add(item.code);
  const amount=price.unitUgx*item.quantity;
  if(!integer(amount,1,MAX)||!integer(total+amount,1,MAX))throw Error('Invoice amount exceeds limit');
  total+=amount;
  return Object.freeze({code:price.code,quantity:item.quantity,unitUgx:price.unitUgx,totalUgx:amount});
 });
 return Object.freeze({id:invoiceId,organizationId,catalogVersion:catalog.version,lines:Object.freeze(lines),totalUgx:total,currency:'UGX',state:'DRAFT',revision:0,paymentKey:null});
}
function checkRevision(invoice:Invoice,expected:number){
 if(!integer(expected,0,Number.MAX_SAFE_INTEGER-1)||invoice.revision!==expected)throw Error('Stale invoice revision');
}
function movement(invoice:Invoice,expected:number,state:Invoice['state'],entries:LedgerEntry[],paymentKey:string|null=invoice.paymentKey):Transition{
 checkRevision(invoice,expected);
 if(entries.reduce((n,e)=>n+e.debit-e.credit,0)!==0||entries.some(e=>!integer(e.debit,0,MAX)||!integer(e.credit,0,MAX)||(e.debit===0)===(e.credit===0)))throw Error('Unbalanced ledger');
 return Object.freeze({invoice:Object.freeze({...invoice,state,revision:invoice.revision+1,paymentKey}),entries:Object.freeze(entries.map(e=>Object.freeze(e)))});
}
export function issueInvoice(invoice:Invoice,expected:number,activeCatalogVersion:number):Transition{
 if(invoice.state!=='DRAFT'||invoice.catalogVersion!==activeCatalogVersion)throw Error('Draft or catalog version no longer valid');
 return movement(invoice,expected,'ISSUED',[
  {account:'RECEIVABLE',debit:invoice.totalUgx,credit:0},
  {account:'DEFERRED_SERVICE_REVENUE',debit:0,credit:invoice.totalUgx}
 ]);
}
export function voidInvoice(invoice:Invoice,expected:number):Transition{
 if(invoice.state!=='DRAFT'&&invoice.state!=='ISSUED')throw Error('Only unpaid invoices can be voided');
 return movement(invoice,expected,'VOID',invoice.state==='DRAFT'?[]:[
  {account:'DEFERRED_SERVICE_REVENUE',debit:invoice.totalUgx,credit:0},
  {account:'RECEIVABLE',debit:0,credit:invoice.totalUgx}
 ]);
}
/** Observation MUST originate from a trusted provider adapter, never an HTTP
 * request body. An observation of a pending transaction is not settlement. */
export type PaymentObservation=Readonly<{providerId:string;transactionId:string;invoiceId:string;organizationId:string;currency:string;amountUgx:number;state:'PENDING'|'SETTLED'|'FAILED'}>;
export function reconcilePayment(invoice:Invoice,expected:number,providerId:string,observation:PaymentObservation):Transition{
 if(!id(providerId)||!observation||observation.providerId!==providerId||!id(observation.transactionId)||
  observation.invoiceId!==invoice.id||observation.organizationId!==invoice.organizationId||observation.currency!==invoice.currency||
  !integer(observation.amountUgx,1,MAX)||observation.amountUgx!==invoice.totalUgx||observation.state!=='SETTLED')throw Error('Payment not independently settled for this invoice');
 const key=JSON.stringify([providerId,observation.transactionId]);
 if(invoice.state==='PAID'&&invoice.paymentKey===key)return Object.freeze({invoice,entries:Object.freeze([])});
 if(invoice.state!=='ISSUED')throw Error('Invoice cannot receive settlement');
 return movement(invoice,expected,'PAID',[
  {account:'PAYMENT_CLEARING',debit:invoice.totalUgx,credit:0},
  {account:'RECEIVABLE',debit:0,credit:invoice.totalUgx}
 ],key);
}
/** Fixed UTC-day term, not a calendar-month promise. No auto-renewal or
 * entitlement before confirmed payment. The same invoice cannot fund twice. */
export type Subscription=Readonly<{organizationId:string;code:string;catalogVersion:number;startsAt:number;endsAt:number;fundingInvoiceId:string}>;
export function paidSubscription(invoice:Invoice,catalogInput:unknown,code:string,startsAt:number):Subscription{
 const catalog=validateCatalog(catalogInput),price=catalog.prices.find(p=>p.code===code);
 if(invoice.state!=='PAID'||!invoice.paymentKey||catalog.version!==invoice.catalogVersion||!price||price.periodDays===null||
  invoice.lines.length!==1||invoice.lines[0].code!==code||invoice.lines[0].quantity!==1||invoice.lines[0].unitUgx!==price.unitUgx||
  !integer(startsAt,0,8_640_000_000_000_000-366*86400000))throw Error('Paid subscription funding required');
 return Object.freeze({organizationId:invoice.organizationId,code,catalogVersion:catalog.version,startsAt,endsAt:startsAt+price.periodDays*86400000,fundingInvoiceId:invoice.id});
}
export function subscriptionActive(subscription:Subscription,now:number):boolean{
 return integer(now,0,8_640_000_000_000_000)&&now>=subscription.startsAt&&now<subscription.endsAt;
}
