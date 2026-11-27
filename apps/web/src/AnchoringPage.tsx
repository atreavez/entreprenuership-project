import React,{useEffect,useRef,useState} from 'react';
import {api,post,DEMO,readable} from './api';
type Proof={kind:string;head:string;proof:string;organizationId:string};
type Job={id:string;commitment:string;revision:number;state:string;transactionId:string|null;failures:number;nextRunAt:number|null;confirmations:number|null;settings:{version:number;target:{providerId:string;networkId:string;minConfirmations:number}}};
type History={revision:string|number;snapshot:Job;recorded_at:string};
export default function AnchoringPage({token,role}:{token:string;role:string}){
 const [jobs,setJobs]=useState<Job[]>([]),[proof,setProof]=useState<Proof|null>(null),[history,setHistory]=useState<History[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [reason,setReason]=useState('');
 const generation=useRef(0),historyGen=useRef(0),locked=useRef(false);
 const permitted=role==='ORG_ADMIN'&&!DEMO;
 async function refresh(){
  const n=++generation.current;
  setError('');setProof(null);setJobs([]);setSelected('');setHistory([]);setReason('');++historyGen.current;
  if(!permitted)return;
  try{const [p,j]=await Promise.all([api<Proof>('/integrations/local-proof',token),api<{jobs:Job[];dispatchState:string}>('/anchoring/jobs',token)]);
   if(n!==generation.current)return;
   if(p.kind!=='LOCAL_AUDIT_COMMITMENT_NOT_BLOCKCHAIN'||!/^[a-f0-9]{64}$/.test(p.proof)||!Array.isArray(j.jobs))throw Error('Invalid anchoring response');
   setProof(p);setJobs(j.jobs);
  }catch(e){if(n===generation.current)setError(e instanceof Error?e.message:'Unable to load anchoring records');}
 }
 useEffect(()=>{void refresh();return()=>{++generation.current;++historyGen.current;}},[token,permitted]);
 async function request(){
  if(!permitted||!proof||proof.head==='GENESIS'||locked.current)return;
  locked.current=true;setBusy(true);setError('');setNotice('');
  const n=generation.current;
  try{const result=await post<{created:boolean;dispatchState:string}>('/anchoring/jobs',token,{expectedProof:proof.proof});
   if(n!==generation.current)return;
   setNotice(result.created?'Request stored. No blockchain transaction submitted.':'Existing request returned. No new transaction submitted.');
   await refresh();
  }catch(e){if(n===generation.current)setError(e instanceof Error?e.message:'Request failed. Refresh and check your current MFA verification.');}
  finally{locked.current=false;setBusy(false);}
 }
 async function inspect(id:string){
  if(!permitted||locked.current)return;
  const n=++historyGen.current;setSelected(id);setHistory([]);setReason('');setError('');
  try{const r=await api<{history:History[]}>('/anchoring/jobs/'+encodeURIComponent(id)+'/history',token);if(n===historyGen.current)setHistory(r.history);}
  catch(e){if(n===historyGen.current)setError(e instanceof Error?e.message:'History unavailable');}
 }
 const selectedJob=jobs.find(j=>j.id===selected);
 async function recover(){
  if(!permitted||!selectedJob||!['BLOCKED','MANUAL_REVIEW'].includes(selectedJob.state)||reason.trim().length<12||locked.current)return;
  locked.current=true;setBusy(true);setError('');setNotice('');
  const n=generation.current;
  try{await post('/anchoring/jobs/'+encodeURIComponent(selectedJob.id)+'/recover',token,{expectedRevision:selectedJob.revision,reason:reason.trim()});
   if(n!==generation.current)return;
   setNotice('Job requeued only. No blockchain transaction submitted.');await refresh();
  }catch(e){if(n===generation.current)setError(e instanceof Error?e.message:'Recovery failed');}
  finally{locked.current=false;setBusy(false);}
 }
 function downloadProof(){
  if(!proof||!permitted)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(proof,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='assettrust-local-audit-proof.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <div className="admin-console">
  <div className="admin-eyebrow">AUDIT INTEGRITY / ORGANIZATION</div>
  <div className="admin-heading"><div><h1>Audit <em>Anchoring</em></h1><p>Manage commitment requests and inspect transaction history.</p></div><button className="button secondary" disabled={!permitted||busy} onClick={()=>void refresh()}>Refresh</button></div>
  <div className="admin-alert"><div><strong>External dispatch is not connected.</strong><p>Local digests and queued requests are not blockchain receipts, trusted timestamps or official title certification.</p></div></div>
  {DEMO&&<p>Read-only design preview. Live records and requests are disabled.</p>}
  {!DEMO&&role!=='ORG_ADMIN'&&<p>Current organization administrator access is required.</p>}
  {error&&<div className="admin-alert admin-alert-error" role="alert">{error}</div>}
  {notice&&<div role="status" className="admin-alert admin-alert-success">{notice}</div>}
  <section className="admin-section"><h2>Current local commitment</h2>
   {proof?<><p>Audit head: <code style={{overflowWrap:'anywhere'}}>{proof.head}</code></p><p>Digest: <code style={{overflowWrap:'anywhere'}}>{proof.proof}</code></p></>:<p>No live commitment loaded.</p>}
   <div className="admin-actions"><button className="button primary" disabled={!permitted||!proof||proof.head==='GENESIS'||busy} onClick={()=>void request()}>Store anchoring request</button><button className="button secondary" disabled={!permitted||!proof} onClick={downloadProof}>Export local proof</button></div>
   <p>Requests require an approved platform policy and recent MFA. <a href="#security">Account Security</a> · <a href="#admin">Admin Control Plane</a></p>
  </section>
  <section className="admin-section"><h2>Anchoring jobs</h2><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Commitment</th><th>Provider / network</th><th>Recorded state</th><th>Transaction</th><th>Confirmations</th><th>Action</th></tr></thead><tbody>
   {jobs.map(j=><tr key={j.id}><td><code style={{overflowWrap:'anywhere'}}>{j.commitment}</code><small>Revision {j.revision}</small></td><td>{j.settings.target.providerId} / {j.settings.target.networkId}<small>Policy v{j.settings.version}</small></td><td>{readable(j.state)}<small>Failures: {j.failures}</small></td><td style={{overflowWrap:'anywhere'}}>{j.transactionId??'Not submitted'}</td><td>{j.confirmations??'—'} / {j.settings.target.minConfirmations}</td><td><button className="button secondary" disabled={!permitted||busy} onClick={()=>void inspect(j.id)}>History</button></td></tr>)}
   {!jobs.length&&<tr><td colSpan={6}>No jobs loaded.</td></tr>}
  </tbody></table></div></section>
  {selected&&<section className="admin-section"><h2>Job history</h2><p style={{overflowWrap:'anywhere'}}>{selected}</p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Revision</th><th>Recorded state</th><th>Transaction</th><th>Recorded at</th></tr></thead><tbody>{history.map(h=><tr key={h.revision}><td>{h.revision}</td><td>{readable(h.snapshot.state)}</td><td>{h.snapshot.transactionId??'—'}</td><td>{new Date(h.recorded_at).toLocaleString('en-UG')}</td></tr>)}{!history.length&&<tr><td colSpan={4}>No history loaded.</td></tr>}</tbody></table></div>{selectedJob&&['BLOCKED','MANUAL_REVIEW'].includes(selectedJob.state)&&<div><label className="field"><span>Recovery reason (12–500 characters)</span><textarea value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label><button className="button secondary" disabled={!permitted||busy||reason.trim().length<12} onClick={()=>void recover()}>Requeue stopped job</button><p>Requires recent MFA and the same approved policy version. External dispatch remains disconnected.</p></div>}</section>}
 </div>;
}
