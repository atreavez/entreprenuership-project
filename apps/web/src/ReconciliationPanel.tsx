import React,{useEffect,useRef,useState} from 'react';
import {api,post,DEMO} from './api';
type Job={id:string;request:{invoiceId:string;providerId:string;transactionId:string};policy:{version:number;maxAttempts:number};revision:number;attempts:number;state:string;nextRunAt:number|null};
type History={revision:number|string;snapshot:{job:Job;reason?:string};recorded_at:string};
export default function ReconciliationPanel({token,role}:{token:string;role:string}){
 const permitted=role==='ORG_ADMIN'&&!DEMO;
 const [jobs,setJobs]=useState<Job[]>([]),[history,setHistory]=useState<History[]>([]),[selected,setSelected]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const generation=useRef(0),historyGeneration=useRef(0),lock=useRef(false);
 async function refresh(){
  const n=++generation.current;++historyGeneration.current;setJobs([]);setHistory([]);setSelected('');setReason('');setError('');
  if(!permitted){setLoading(false);return;}setLoading(true);
  try{const r=await api<{jobs:Job[];dispatchState:string}>('/billing/reconciliation/jobs',token);
   if(n!==generation.current)return;
   if(r.dispatchState!=='NOT_CONNECTED'||!Array.isArray(r.jobs))throw Error('Unexpected reconciliation status');
   setJobs(r.jobs);
  }catch(e){if(n===generation.current)setError(e instanceof Error?e.message:'Reconciliation register unavailable');}
  finally{if(n===generation.current)setLoading(false);}
 }
 useEffect(()=>{void refresh();return()=>{++generation.current;++historyGeneration.current;}},[token,permitted]);
 async function inspect(id:string){
  if(!permitted||lock.current||loading)return;
  const n=++historyGeneration.current;setSelected(id);setHistory([]);setReason('');setError('');
  try{const r=await api<{history:History[];dispatchState:string}>('/billing/reconciliation/jobs/'+encodeURIComponent(id)+'/history',token);
   if(n===historyGeneration.current){if(r.dispatchState!=='NOT_CONNECTED'||!Array.isArray(r.history))throw Error('Unexpected history response');setHistory(r.history);}
  }catch(e){if(n===historyGeneration.current)setError(e instanceof Error?e.message:'History unavailable');}
 }
 const job=jobs.find(j=>j.id===selected);
 async function recover(){
  if(!permitted||loading||lock.current||!job||!['BLOCKED','REVIEW_REQUIRED'].includes(job.state)||reason.trim().length<12||reason.length>500)return;
  lock.current=true;setBusy(true);setError('');setNotice('');
  const n=generation.current;
  try{await post('/billing/reconciliation/jobs/'+encodeURIComponent(job.id)+'/recover',token,{expectedRevision:job.revision,reason:reason.trim()});
   if(n!==generation.current)return;setNotice('Requeued only. No payment verified or collected.');await refresh();
  }catch(e){if(n===generation.current){setError((e instanceof Error?e.message:'Recovery failed')+' Refresh before retrying.');setSelected('');setHistory([]);}}
  finally{lock.current=false;setBusy(false);}
 }
 return <section className="admin-section"><div className="admin-section-head"><h2>Payment reconciliation</h2><button className="button secondary" disabled={!permitted||loading||busy} onClick={()=>void refresh()}>Refresh jobs</button></div>
  <p>Dispatch not connected. These records represent verification requests, not payment receipts. Only trusted worker ingestion may create jobs.</p>
  {error&&<div className="admin-alert admin-alert-error" role="alert">{error}</div>}{notice&&<div className="admin-alert admin-alert-success" role="status">{notice}</div>}
  {loading&&<p role="status">Loading reconciliation records…</p>}
  <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Invoice / reference</th><th>State</th><th>Attempts</th><th>Next check</th><th>Action</th></tr></thead><tbody>
  {jobs.map(j=><tr key={j.id}><td>{j.request.invoiceId}<small>{j.request.providerId} · {j.request.transactionId}</small></td><td>{j.state}<small>Revision {j.revision} · policy v{j.policy.version}</small></td><td>{j.attempts} / {j.policy.maxAttempts}</td><td>{j.nextRunAt===null?'—':new Date(j.nextRunAt).toLocaleString('en-UG')}</td><td><button className="button secondary" disabled={!permitted||loading||busy} onClick={()=>void inspect(j.id)}>History</button></td></tr>)}
  {!jobs.length&&<tr><td colSpan={5}>No reconciliation records loaded.</td></tr>}</tbody></table></div>
  {job&&<div><h3>Job history</h3><p>{job.id}</p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Revision</th><th>State</th><th>Recovery reason</th><th>Recorded</th></tr></thead><tbody>{history.map(h=><tr key={h.revision}><td>{h.revision}</td><td>{h.snapshot.job.state}</td><td>{h.snapshot.reason??'—'}</td><td>{new Date(h.recorded_at).toLocaleString('en-UG')}</td></tr>)}{!history.length&&<tr><td colSpan={4}>No history loaded.</td></tr>}</tbody></table></div>
  {['BLOCKED','REVIEW_REQUIRED'].includes(job.state)&&<div className="exp-form"><label className="field"><span>Recovery reason (12–500 characters)</span><textarea value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button className="button secondary" disabled={!permitted||busy||loading||reason.trim().length<12} onClick={()=>void recover()}>Requeue stopped job</button><p>Requires recent MFA and original approved policy. This does not submit or settle a payment.</p></div>}</div>}
 </section>;
}
