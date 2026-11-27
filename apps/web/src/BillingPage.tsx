import React,{useEffect,useRef,useState} from 'react';
import {api,post,DEMO,fmt} from './api';
import ReconciliationPanel from './ReconciliationPanel';
import JournalExportPanel from './JournalExportPanel';
type Price={code:string;unitUgx:number;periodDays:number|null};
type Catalog={version:number;prices:Price[]};
type Invoice={id:string;catalogVersion:number;totalUgx:number;state:'DRAFT'|'ISSUED'|'VOID'|'PAID';revision:number;lines:{code:string;quantity:number;unitUgx:number;totalUgx:number}[]};
type Journal={invoiceId:string;revision:number;event:string;debitAccount:string;creditAccount:string;amountUgx:number;recordedAt:string};
type Subscription={fundingInvoiceId:string;code:string;catalogVersion:number;startsAt:number;endsAt:number};
const money=(amount:number)=>'UGX '+fmt(amount);
const errorText=(e:unknown)=>e instanceof Error?e.message:'Billing request failed';
export default function BillingPage({token,role}:{token:string;role:string}){
 const permitted=role==='ORG_ADMIN'&&!DEMO;
 const [catalog,setCatalog]=useState<Catalog|null>(null),[invoices,setInvoices]=useState<Invoice[]>([]),[journal,setJournal]=useState<Journal[]>([]),[subscriptions,setSubscriptions]=useState<Subscription[]>([]);
 const [quantities,setQuantities]=useState<Record<string,string>>({}),[selected,setSelected]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[loaded,setLoaded]=useState(false);
 const [confirmation,setConfirmation]=useState<{id:string;revision:number;action:'ISSUE'|'VOID'}|null>(null);
 const generation=useRef(0),locked=useRef(false);
 async function refresh(){
  const n=++generation.current;
  setError('');setLoaded(false);setCatalog(null);setInvoices([]);setJournal([]);setSubscriptions([]);setSelected('');setConfirmation(null);setQuantities({});
  if(!permitted){setLoading(false);return;}
  setLoading(true);
  try{
   const [c,i,j,s]=await Promise.all([
    api<{catalog:Catalog|null;paymentState:string}>('/billing/catalog',token),
    api<{invoices:Invoice[];paymentState:string}>('/billing/invoices',token),
    api<{entries:Journal[]}>('/billing/journal',token),
    api<{subscriptions:Subscription[];activationState:string}>('/billing/subscriptions',token)
   ]);
   if(n!==generation.current)return;
   if(c.paymentState!=='NOT_CONNECTED'||i.paymentState!=='NOT_CONNECTED'||s.activationState!=='NOT_CONNECTED'||!Array.isArray(i.invoices)||!Array.isArray(j.entries)||!Array.isArray(s.subscriptions)||(c.catalog!==null&&!Array.isArray(c.catalog.prices)))throw Error('Unexpected commercial response; refresh or contact support.');
   setCatalog(c.catalog);setInvoices(i.invoices);setJournal(j.entries);setSubscriptions(s.subscriptions);setLoaded(true);
  }catch(e){if(n===generation.current)setError(errorText(e));}
  finally{if(n===generation.current)setLoading(false);}
 }
 useEffect(()=>{void refresh();return()=>{++generation.current;}},[token,permitted]);
 const items=(catalog?.prices??[]).filter(p=>quantities[p.code]!==undefined&&quantities[p.code]!=='').map(p=>({code:p.code,quantity:Number(quantities[p.code])}));
 const estimated=items.reduce((sum,i)=>sum+i.quantity*(catalog?.prices.find(p=>p.code===i.code)?.unitUgx??0),0);
 const valid=!!catalog&&items.length>0&&items.every(i=>Number.isSafeInteger(i.quantity)&&i.quantity>=1&&i.quantity<=10000)&&Number.isSafeInteger(estimated)&&estimated>0&&estimated<=1000000000;
 async function mutate(path:string,body:unknown,success:string){
  if(!permitted||!loaded||locked.current||loading)return;
  locked.current=true;setBusy(true);setError('');setNotice('');
  const n=generation.current;
  try{await post(path,token,body);if(n!==generation.current)return;setNotice(success);await refresh();}
  catch(e){if(n===generation.current){setError(errorText(e)+' Refresh before retrying; an interrupted request may already have committed.');setLoaded(false);setConfirmation(null);}}
  finally{locked.current=false;setBusy(false);}
 }
 function create(e:React.FormEvent){e.preventDefault();if(valid&&catalog)void mutate('/billing/invoices',{expectedCatalogVersion:catalog.version,items},'Draft invoice created. No payment was collected.');}
 function confirm(){if(!confirmation)return;const i=invoices.find(x=>x.id===confirmation.id);if(!i||i.revision!==confirmation.revision)return;
  void mutate('/billing/invoices/'+encodeURIComponent(i.id)+'/transition',{expectedRevision:i.revision,action:confirmation.action},confirmation.action==='ISSUE'?'Invoice issued. No payment was collected.':'Invoice voided.');
 }
 const detail=invoices.find(i=>i.id===selected);
 const total=(state:string)=>invoices.filter(i=>i.state===state).reduce((n,i)=>n+i.totalUgx,0);
 const unavailable=!permitted||!loaded||busy||loading;
 return <div className="admin-console billing-console">
  <div className="admin-eyebrow">COMMERCIAL OPERATIONS / ORGANIZATION</div>
  <div className="admin-heading"><div><h1>Billing <em>& plans</em></h1><p>Approved service prices, invoices and recorded financial history.</p></div><button className="button secondary" disabled={!permitted||busy||loading} onClick={()=>void refresh()}>Refresh</button></div>
  <div className="admin-alert"><div><strong>Payment collection is not connected.</strong><p>Issuing an invoice does not collect money. Subscription activation and automatic renewal are unavailable. Financial requests require recent administrator MFA.</p><a href="#security">Account Security</a> · <a href="#admin">Pricing approval</a> · <a href="#quotes">Separate quotation register</a></div></div>
  {DEMO?<p>Read-only design preview. No fictional balances are presented as live data.</p>:role!=='ORG_ADMIN'?<p>Organization administrator access required.</p>:null}
  {error&&<div className="admin-alert admin-alert-error" role="alert">{error}</div>}{notice&&<div className="admin-alert admin-alert-success" role="status">{notice}</div>}
  {loading&&<p role="status">Loading billing records…</p>}
  <div className="admin-stats">{['DRAFT','ISSUED','PAID','VOID'].map(state=><div key={state}><strong>{loaded?money(total(state)):'—'}</strong><span>{state} · latest 50 invoices only</span></div>)}</div>
  <section className="admin-section"><h2>Approved catalog {catalog?'· v'+catalog.version:''}</h2>
   {loaded&&!catalog?<p>No approved pricing yet. An independently approved platform catalog is required.</p>:null}
   <form className="exp-form" onSubmit={create}>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Service</th><th>Unit price</th><th>Term</th><th>Quantity</th></tr></thead><tbody>
     {(catalog?.prices??[]).map(p=><tr key={p.code}><td>{p.code}</td><td>{money(p.unitUgx)}</td><td>{p.periodDays===null?'One-time':p.periodDays+' days'}</td><td><input aria-label={'Quantity for '+p.code} type="number" min={1} max={10000} step={1} placeholder="Not selected" disabled={unavailable} value={quantities[p.code]??''} onChange={e=>setQuantities(q=>({...q,[p.code]:e.target.value}))}/></td></tr>)}
     {!catalog?.prices.length&&<tr><td colSpan={4}>No catalog loaded.</td></tr>}
    </tbody></table></div>
    <p>Estimated total: <strong>{valid?money(estimated):'—'}</strong> · server recalculates from approved prices.</p><button className="button primary" disabled={unavailable||!valid}>Create draft invoice</button>
   </form>
  </section>
  <section className="admin-section"><h2>Invoice register</h2><p>Latest 50 records; quotations are not included.</p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Invoice</th><th>Amount</th><th>State</th><th>Action</th></tr></thead><tbody>
   {invoices.map(i=><tr key={i.id}><td><code>{i.id}</code><small>Catalog v{i.catalogVersion} · revision {i.revision}</small></td><td>{money(i.totalUgx)}</td><td>{i.state}</td><td><div className="admin-actions"><button disabled={unavailable} onClick={()=>{setSelected(i.id);setConfirmation(null);}}>Details</button>{i.state==='DRAFT'&&<button disabled={unavailable||catalog?.version!==i.catalogVersion} onClick={()=>setConfirmation({id:i.id,revision:i.revision,action:'ISSUE'})}>Issue</button>}{['DRAFT','ISSUED'].includes(i.state)&&<button disabled={unavailable} onClick={()=>setConfirmation({id:i.id,revision:i.revision,action:'VOID'})}>Void</button>}</div></td></tr>)}
   {!invoices.length&&<tr><td colSpan={4}>{loaded?'No invoices recorded.':'No invoice records loaded.'}</td></tr>}
  </tbody></table></div>
  {confirmation&&<div className="admin-alert"><div><strong>Confirm {confirmation.action.toLowerCase()} of invoice</strong><p>{confirmation.id} · {money(invoices.find(i=>i.id===confirmation.id)?.totalUgx??0)}. This changes a financial record, not payment status.</p><div className="admin-actions"><button className="button primary" disabled={unavailable} onClick={confirm}>Confirm {confirmation.action.toLowerCase()}</button><button className="button secondary" disabled={busy} onClick={()=>setConfirmation(null)}>Cancel</button></div></div></div>}
  {detail&&<div><h3>Invoice lines</h3><p>{detail.id}</p>{detail.lines.map(l=><p key={l.code}>{l.code} · {l.quantity} × {money(l.unitUgx)} = {money(l.totalUgx)}</p>)}</div>}</section>
  <section className="admin-section"><h2>Financial journal</h2><p>Latest 100 recorded balanced posting pairs. This is not a cash balance or a complete accounting statement.</p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Invoice / event</th><th>Debit</th><th>Credit</th><th>Amount</th><th>Recorded</th></tr></thead><tbody>{journal.map(j=><tr key={j.invoiceId+':'+j.revision}><td>{j.invoiceId}<small>{j.event} · revision {j.revision}</small></td><td>{j.debitAccount}</td><td>{j.creditAccount}</td><td>{money(j.amountUgx)}</td><td>{new Date(j.recordedAt).toLocaleString('en-UG')}</td></tr>)}{!journal.length&&<tr><td colSpan={5}>{loaded?'No journal entries.':'No journal records loaded.'}</td></tr>}</tbody></table></div></section>
  <section className="admin-section"><h2>Subscription register</h2><p>Recorded terms only. Feature entitlement enforcement is not connected.</p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Service</th><th>Funding invoice</th><th>Starts</th><th>Ends (exclusive)</th></tr></thead><tbody>{subscriptions.map(s=><tr key={s.fundingInvoiceId}><td>{s.code}<small>Catalog v{s.catalogVersion}</small></td><td>{s.fundingInvoiceId}</td><td>{new Date(s.startsAt).toLocaleString('en-UG')}</td><td>{new Date(s.endsAt).toLocaleString('en-UG')}</td></tr>)}{!subscriptions.length&&<tr><td colSpan={4}>{loaded?'No subscription terms recorded.':'No subscription records loaded.'}</td></tr>}</tbody></table></div></section>
  <JournalExportPanel token={token} role={role}/>
  <ReconciliationPanel token={token} role={role}/>
 </div>;
}
