import type {Database} from '../../../database';
import type {AuditService} from '../../../audit';
import type {UserAuth} from '../../../common';
import type {PoolClient} from 'pg';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {draftInvoice,issueInvoice,voidInvoice,paidSubscription,validateCatalog,type Catalog,type Invoice,type Transition,type Subscription} from '../domain/commercial-policy';
import {supportedPurchase} from '../domain/financial-consistency';
import type {BillingRepository,BillingTransaction} from '../application/payment.port';
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
function numeric(v:unknown):number{
 if(typeof v!=='number'&&(typeof v!=='string'||!/^\d+$/.test(v)))throw Error('Invalid persisted integer');
 const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid persisted integer');return n;
}
async function loadCatalog(tx:PoolClient,version?:number):Promise<Catalog|null>{
 const result=version===undefined
  ?await tx.query('SELECT version,prices FROM public.billing_catalog_versions ORDER BY version DESC LIMIT 1')
  :await tx.query('SELECT version,prices FROM public.billing_catalog_versions WHERE version=$1',[version]);
 if(result.rows.length===0)return null;
 return validateCatalog({version:numeric(result.rows[0].version),prices:result.rows[0].prices});
}
export async function hydrateInvoice(tx:PoolClient,r:any):Promise<Invoice>{
 const catalog=await loadCatalog(tx,numeric(r.catalog_version));
 if(!catalog||!Array.isArray(r.lines))throw Error('Missing invoice pricing snapshot');
 const initial=draftInvoice(r.id,r.organization_id,catalog,catalog.version,r.lines.map((l:any)=>({code:l.code,quantity:l.quantity})));
 if(canonical(initial.lines)!==canonical(r.lines)||initial.totalUgx!==numeric(r.total_ugx)||r.currency!=='UGX')throw Error('Invalid stored invoice snapshot');
 const revision=numeric(r.revision),state=r.state;
 if(!((state==='DRAFT'&&revision===0)||(state==='ISSUED'&&revision===1)||(state==='PAID'&&revision===2)||(state==='VOID'&&(revision===1||revision===2))))throw Error('Invalid stored invoice state');
 if(state==='PAID'?(typeof r.payment_key!=='string'||!r.payment_key):r.payment_key!==null)throw Error('Invalid stored payment reference');
 return Object.freeze({...initial,state,revision,paymentKey:r.payment_key});
}
/** Request-scoped adapter. NOT registered in Nest and migration is staged.
 * Only current MFA-verified admins can execute these transactions.
 * Settlement is intentionally refused by this administrative adapter; a
 * separately trusted reconciliation worker must independently observe payment.
 */
export class PgBillingRepository implements BillingRepository{
 constructor(private readonly db:Database,private readonly audit:AuditService,private readonly actor:UserAuth,private readonly sessionId:string){}
 async transaction<T>(organizationId:string,work:(tx:BillingTransaction)=>Promise<T>):Promise<T>{
  if(organizationId!==this.actor.organizationId)throw Error('Billing tenant mismatch');
  return this.db.transaction(async connection=>{
   await setTenantScope(connection,organizationId);
   await assertCurrentAdminStepUp(connection,this.actor,this.sessionId);
   // Serialize catalog publication with draft creation and issuing; the future
   // publication adapter MUST acquire the same transaction advisory lock first.
   const catalogLock=()=>connection.query("SELECT pg_advisory_xact_lock_shared(hashtext('assettrust:billing:catalog'))");
   const scope=(org:string)=>{if(org!==organizationId)throw Error('Billing tenant mismatch');};
   const read=async(org:string,id:string)=>{
    scope(org);
    const result=await connection.query('SELECT * FROM public.billing_invoices WHERE organization_id=$1 AND id=$2 FOR UPDATE',[org,id]);
    return result.rows.length===1?hydrateInvoice(connection,result.rows[0]):null;
   };
   const tx:BillingTransaction={
    approvedCatalog:async()=>{await catalogLock();return loadCatalog(connection);},
    invoice:read,
    listInvoices:async(org)=>{
     scope(org);const {rows}=await connection.query('SELECT * FROM public.billing_invoices WHERE organization_id=$1 ORDER BY created_at DESC,id LIMIT 50',[org]);
     const invoices:Invoice[]=[];for(const row of rows)invoices.push(await hydrateInvoice(connection,row));return invoices;
    },
    journal:async(org)=>{
     scope(org);
     const {rows}=await connection.query('SELECT invoice_id,revision,event,debit_account,credit_account,amount_ugx,recorded_at FROM public.billing_journal WHERE organization_id=$1 ORDER BY recorded_at DESC,invoice_id,revision LIMIT 100',[org]);
     return rows.map(r=>({invoiceId:r.invoice_id,revision:numeric(r.revision),event:r.event,debitAccount:r.debit_account,creditAccount:r.credit_account,amountUgx:numeric(r.amount_ugx),recordedAt:new Date(r.recorded_at).toISOString()}));
    },
    subscriptions:async(org)=>{
     scope(org);
     const {rows}=await connection.query('SELECT organization_id,funding_invoice_id,code,catalog_version,starts_at,ends_at FROM public.billing_subscriptions WHERE organization_id=$1 ORDER BY ends_at DESC,funding_invoice_id LIMIT 100',[org]);
     return rows.map(r=>({organizationId:r.organization_id,fundingInvoiceId:r.funding_invoice_id,code:r.code,catalogVersion:numeric(r.catalog_version),startsAt:numeric(r.starts_at),endsAt:numeric(r.ends_at)}));
    },
    createDraft:async(id,expectedVersion,items)=>{
     await catalogLock();const catalog=await loadCatalog(connection);
     if(!catalog)throw Error('Approved billing catalog unavailable');
     const draft=draftInvoice(id,organizationId,catalog,expectedVersion,items);
     if(!supportedPurchase(draft.lines,catalog.prices))throw Error('Purchase a recurring service separately, quantity one');
     await connection.query(`INSERT INTO public.billing_invoices(id,organization_id,catalog_version,lines,total_ugx)
      VALUES($1,$2,$3,$4::jsonb,$5)`,[draft.id,organizationId,draft.catalogVersion,JSON.stringify(draft.lines),draft.totalUgx]);
     await this.audit.write(connection,this.actor,'BILLING_DRAFT_CREATED','invoice',id,{catalogVersion:draft.catalogVersion,totalUgx:draft.totalUgx});
     return draft;
    },
    commit:async(org,expected,transition)=>{
     scope(org);if(transition.invoice.organizationId!==org)throw Error('Billing tenant mismatch');
     if(transition.invoice.state==='PAID')throw Error('Trusted payment reconciliation is not connected');
     await catalogLock();
     const current=await read(org,transition.invoice.id);
     if(!current||current.revision!==expected)return false;
     const active=transition.invoice.state==='ISSUED'?await loadCatalog(connection):null;
     if(transition.invoice.state==='ISSUED'&&active&&!supportedPurchase(current.lines,active.prices))throw Error('Unsupported recurring allocation');
     const derived=transition.invoice.state==='ISSUED'&&active?issueInvoice(current,expected,active.version):
      transition.invoice.state==='VOID'?voidInvoice(current,expected):null;
     if(!derived||canonical(derived)!==canonical(transition))throw Error('Invalid financial transition');
     const updated=await connection.query(`UPDATE public.billing_invoices SET state=$4,revision=$5
      WHERE organization_id=$1 AND id=$2 AND revision=$3 AND state=$6 RETURNING id`,[org,current.id,expected,derived.invoice.state,derived.invoice.revision,current.state]);
     if(updated.rowCount!==1)return false;
     if(derived.entries.length){
      const debit=derived.entries.find(e=>e.debit>0),credit=derived.entries.find(e=>e.credit>0);
      if(derived.entries.length!==2||!debit||!credit||debit.debit!==current.totalUgx||credit.credit!==current.totalUgx)throw Error('Invalid journal pair');
      await connection.query(`INSERT INTO public.billing_journal(organization_id,invoice_id,revision,event,debit_account,credit_account,amount_ugx)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,[org,current.id,derived.invoice.revision,derived.invoice.state,debit.account,credit.account,current.totalUgx]);
     }
     await this.audit.write(connection,this.actor,'BILLING_INVOICE_'+derived.invoice.state,'invoice',current.id,{revision:derived.invoice.revision,totalUgx:current.totalUgx});
     return true;
    },

   };
   return work(tx);
  });
 }
}
