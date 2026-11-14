import React,{useEffect,useState} from 'react';
import {BellRing,Mail,MessageCircle,ShieldCheck,Lock,RefreshCw,CheckCircle2,AlertTriangle,Clock3,Radio,KeyRound,ShieldAlert,Check, XCircle,Settings2,ArrowUpRight} from 'lucide-react';
import {api,post,DEMO} from './api';
type Channel='EMAIL'|'SMS';type Provider='NONE'|'SMTP_RELAY'|'HTTPS_RELAY';type Status='DISABLED'|'STAGED';
type Route={channel:Channel;provider:Provider;status:Status;senderLabel:string;credentialRef:string|null;version:number;updatedAt:string|null;deliveryState:'DISABLED'|'NOT_CONNECTED'};
type Change={id:string;channel:Channel;provider:Provider;status:Status;senderLabel:string;credentialRef:string|null;expected_version:number;reason:string;proposed_by:string;proposed_at:string;decision:'PENDING'|'APPROVED'|'REJECTED'};
const fixtures:Route[]=[
 {channel:'EMAIL',provider:'SMTP_RELAY',status:'STAGED',senderLabel:'AssetTrust Uganda',credentialRef:'vault://assettrust/email-primary',version:2,updatedAt:'2026-11-10T17:00:00Z',deliveryState:'NOT_CONNECTED'},
 {channel:'SMS',provider:'NONE',status:'DISABLED',senderLabel:'AssetTrust',credentialRef:null,version:0,updatedAt:null,deliveryState:'DISABLED'},
];
const fixtureChanges:Change[]=[{id:'demo-pending',channel:'SMS',provider:'HTTPS_RELAY',status:'STAGED',senderLabel:'AssetTrust',credentialRef:'vault://assettrust/sms-primary',expected_version:0,reason:'Prepare SMS delivery for the verification team',proposed_by:'another-admin',proposed_at:'2026-11-10T18:00:00Z',decision:'PENDING'}];
const asMessage=(e:unknown)=>e instanceof Error?e.message:'The operation could not be completed';
export default function NotificationProvidersPage({token,userId}:{token:string;userId:string}){
 const [routes,setRoutes]=useState<Route[]>([]),[changes,setChanges]=useState<Change[]>([]),[channel,setChannel]=useState<Channel>('EMAIL');
 const [provider,setProvider]=useState<Provider>('SMTP_RELAY'),[status,setStatus]=useState<Status>('STAGED'),[senderLabel,setSenderLabel]=useState('AssetTrust Uganda'),[credentialRef,setCredentialRef]=useState('vault://assettrust/email-primary'),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){setLoading(true);setError('');try{
  if(DEMO){setRoutes(fixtures);setChanges(fixtureChanges);return;}
  const [a,b]=await Promise.all([api<{routes:Route[]}>('/admin-providers/routes',token),api<{changes:Change[]}>('/admin-providers/changes',token)]);
  setRoutes(a.routes);setChanges(b.changes);
 }catch(e){setError(asMessage(e));setRoutes([]);setChanges([])}finally{setLoading(false)}}
 useEffect(()=>{void load()},[token]);
 const active=routes.find(x=>x.channel===channel);
 useEffect(()=>{if(!active)return;setProvider(active.provider);setStatus(active.status);setSenderLabel(active.senderLabel);setCredentialRef(active.credentialRef||'');setNotice('');},[channel,active?.version,active?.provider,active?.status,active?.senderLabel,active?.credentialRef]);
 function changeStatus(value:Status){setStatus(value);if(value==='DISABLED'){setProvider('NONE');setCredentialRef('');}else if(provider==='NONE')setProvider(channel==='EMAIL'?'SMTP_RELAY':'HTTPS_RELAY');}
 function changeChannel(next:Channel){setChannel(next);setReason('');setError('');}
 async function propose(e:React.FormEvent){e.preventDefault();if(DEMO){setError('Preview mode — no configuration was saved. Connect the running API to make changes.');return;}if(!active)return;
  setBusy(true);setError('');setNotice('');try{const r=await post('/admin-providers/changes',token,{channel,provider,status,senderLabel,credentialRef:status==='DISABLED'?null:credentialRef,expectedVersion:active.version,reason});setNotice(r.notice||'Pending second-administrator review');setReason('');await load()}catch(e){setError(asMessage(e))}finally{setBusy(false)}}
 async function decide(id:string,decision:'APPROVE'|'REJECT'){if(DEMO){setError('Preview mode — this does not approve real changes.');return;}setBusy(true);setError('');setNotice('');try{const r=await post('/admin-providers/changes/'+encodeURIComponent(id)+'/decision',token,{decision});setNotice((r.applied?'Configuration published. ':'Proposal rejected. ')+(r.notice||''));await load()}catch(e){setError(asMessage(e))}finally{setBusy(false)}}
 const pending=changes.filter(c=>c.decision==='PENDING');const stageCount=routes.filter(r=>r.status==='STAGED').length;
 return <div className="admin-console provider-console">
  <div className="admin-eyebrow"><Radio size={16}/> PLATFORM GOVERNANCE / PROVIDER REGISTRY</div>
  <div className="admin-heading"><div><h1>Notification <em>Providers</em></h1><p>Prepare reliable communication channels without exposing credentials, bypassing approvals, or misrepresenting delivery.</p></div><button className="button secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
  <div className="provider-warning"><ShieldAlert size={22}/><div><strong>External sending is disabled in v0.33.</strong><p>STAGED means configuration is approved, not that messages are being delivered. SMTP/HTTPS relay adapters, secret resolution, provider verification, delivery receipts, and opt-in compliance are not yet deployed. In-app notifications remain separate.</p></div></div>
  {error&&<div className="admin-alert admin-alert-error" role="alert"><AlertTriangle size={18}/>{error}</div>}{notice&&<div className="admin-alert admin-alert-success"><CheckCircle2 size={18}/>{notice}</div>}
  <div className="provider-stats"><div><span>Configured channels</span><strong>{routes.length}/2</strong><small>Email · SMS</small></div><div><span>Prepared routes</span><strong>{stageCount}</strong><small>No external sending</small></div><div><span>Pending approvals</span><strong>{pending.length}</strong><small>Second-admin review required</small></div><div><span>Delivery state</span><strong className="provider-off">OFF</strong><small>Fail-closed transport</small></div></div>
  <div className="provider-layout">
   <section className="provider-workspace"><div className="provider-section-heading"><h3>Channel configuration</h3><span>Organization-scoped</span></div>
    <div className="provider-tabs"><button className={channel==='EMAIL'?'active':''} onClick={()=>changeChannel('EMAIL')}><Mail size={19}/> Email <small>{routes.find(r=>r.channel==='EMAIL')?.status||'DISABLED'}</small></button><button className={channel==='SMS'?'active':''} onClick={()=>changeChannel('SMS')}><MessageCircle size={19}/> SMS <small>{routes.find(r=>r.channel==='SMS')?.status||'DISABLED'}</small></button></div>
    <form className="provider-form" onSubmit={propose}>
     <div className="provider-field-row"><label><span>Configuration status</span><select value={status} onChange={e=>changeStatus(e.target.value as Status)}><option value="DISABLED">Disabled</option><option value="STAGED">Staged (not live)</option></select></label><label><span>Provider adapter</span><select value={provider} disabled={status==='DISABLED'} onChange={e=>setProvider(e.target.value as Provider)}><option value="NONE">None</option>{channel==='EMAIL'&&<option value="SMTP_RELAY">SMTP relay — planned</option>}<option value="HTTPS_RELAY">HTTPS relay — planned</option></select></label></div>
     <label><span>Sender display name</span><input maxLength={80} required value={senderLabel} onChange={e=>setSenderLabel(e.target.value)} placeholder="AssetTrust Uganda"/></label>
     <label><span>Credential reference (alias only — never a password)</span><input required={status==='STAGED'} disabled={status==='DISABLED'} value={credentialRef} onChange={e=>setCredentialRef(e.target.value)} placeholder="vault://assettrust/email-primary" autoComplete="off"/><small>Only a reference is stored. The secret itself must be provisioned securely outside the admin database.</small></label>
     <label><span>Reason for change</span><textarea required minLength={12} maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why this route or provider must change"/></label>
     <div className="provider-submit"><span><Lock size={15}/> Requires recent MFA and a different admin's approval</span><button className="button primary" disabled={busy||loading||!active} type="submit"><ShieldCheck size={16}/> Propose change</button></div>
    </form>
   </section>
   <aside className="provider-aside"><div className="provider-section-heading"><h3>Release safeguards</h3></div>
    <div className="provider-protections"><div><ShieldCheck size={18}/><span><strong>Approval before publication</strong><small>No administrator can approve their own provider changes.</small></span></div><div><KeyRound size={18}/><span><strong>Secret isolation</strong><small>Raw API keys, SMTP passwords and arbitrary URLs are rejected.</small></span></div><div><Lock size={18}/><span><strong>Tenant-only configuration</strong><small>Organizations cannot read or change one another's provider routes.</small></span></div><div><BellRing size={18}/><span><strong>In-app notifications remain</strong><small>Existing case assignments continue in the private notification inbox.</small></span></div></div>
    <div className="provider-delivery-summary"><span>OUTBOUND GATE <Radio size={15}/></span><strong><XCircle size={20}/> Not connected</strong><p>Staged settings cannot trigger external email or SMS. Delivery acknowledgments require verified provider transport.</p></div>
   </aside>
  </div>
  <section className="provider-approvals"><div className="provider-section-heading"><h3>Approval queue & history</h3><span>Most recent 100 proposals</span></div>{changes.length===0?<p className="provider-empty">No provider configuration proposals yet.</p>:<div className="provider-approval-list">{changes.slice(0,15).map(c=><div className="provider-approval-row" key={c.id}><div className="provider-approval-icon">{c.channel==='EMAIL'?<Mail size={21}/>:<MessageCircle size={21}/>}</div><div className="provider-approval-info"><strong>{c.channel} · {c.provider.replaceAll('_',' ')}</strong><p>{c.reason}</p><small>Requested: {c.status} · Revision {c.expected_version} · {new Date(c.proposed_at).toLocaleDateString()}</small></div><div className="provider-approval-actions"><span className={c.decision==='PENDING'?'provider-pill pending':'provider-pill'}>{c.decision==='PENDING'?<Clock3 size={13}/>:<Check size={13}/>} {c.decision}</span>{c.decision==='PENDING'&&<div><button disabled={busy||c.proposed_by===userId} onClick={()=>void decide(c.id,'APPROVE')} className="button green">Approve</button><button disabled={busy||c.proposed_by===userId} onClick={()=>void decide(c.id,'REJECT')} className="button secondary">Reject</button></div>}</div></div>)}</div>}</section>
  <p className="provider-bottom-note"><Settings2 size={15}/> Configurations are auditable, versioned and intentionally non-delivering. No external message has been sent by this administration page.</p>
 </div>;
}
