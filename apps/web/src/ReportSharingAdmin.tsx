import React,{useEffect,useState} from 'react';
import {ShieldCheck,RefreshCw,LockKeyhole,Copy,CheckCircle2,XCircle,AlertTriangle} from 'lucide-react';
import {DEMO,api,post,date} from './api';

type Share={id:string;report_id:string;recipient_label:string;reason:string;expires_hours:number;max_downloads:number;download_count:number;status:string;proposed_by:string;proposed_at:string;reviewed_by:string|null;expires_at:string|null;revoked_at:string|null};
type Redemption={id:string;share_id:string;report_id:string;pdf_sha256:string;redeemed_at:string};
type SecurityWarning={share_id:string;failed_count:number;window_started_at:string;last_failed_at:string};
export default function ReportSharingAdmin({token,userId,reportId}:{token:string;userId:string;reportId?:string}){
 const [data,setData]=useState<{shares:Share[];redemptions:Redemption[];security:SecurityWarning[]}>({shares:[],redemptions:[],security:[]});
 const [label,setLabel]=useState('Authorized transaction recipient');const [reason,setReason]=useState('Confidential sharing for an authorized verification review');
 const [hours,setHours]=useState(24),[maximum,setMaximum]=useState(1);
 const [created,setCreated]=useState<{id:string;accessToken:string;accessCode:string}|null>(null);
 const [revokeReason,setRevokeReason]=useState('Recipient access no longer required; revoke the capability');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=async()=>{if(DEMO)return;try{setData(await api('/reports/shares',token))}catch(e:any){setError(e.message||'Sharing administration unavailable')}};
 useEffect(()=>{void reload()},[token]);
 const safe=async(task:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await task()}catch(e:any){setError(e.message||'Sharing operation failed')}finally{setBusy(false)}};
 const propose=()=>void safe(async()=>{
  if(DEMO){setNotice('Design preview only; no credentials were generated.');return}
  if(!reportId)throw Error('Select an issued report above');
  const x=await post('/reports/shares',token,{reportId,recipientLabel:label,reason,expiresHours:hours,maxDownloads:maximum});
  setCreated({id:x.id,accessToken:x.accessToken,accessCode:x.accessCode});setNotice('Share proposal created. A second administrator must approve it. Copy both credentials now; they cannot be recovered later.');await reload();
 });
 const decide=(s:Share,decision:'APPROVE'|'REJECT')=>void safe(async()=>{
  if(DEMO)return setNotice('Design preview: no approval submitted');
  await post(`/reports/shares/${s.id}/decision`,token,{decision});setNotice(decision==='APPROVE'?'Recipient capability approved and now time-limited.':'Share request rejected.');await reload();
 });
 const revoke=(s:Share)=>void safe(async()=>{
  if(DEMO)return setNotice('Design preview: no revocation submitted');
  await post(`/reports/shares/${s.id}/revoke`,token,{reason:revokeReason});setNotice('Recipient capability revoked immediately.');await reload();
 });
 const copy=(value:string)=>{void navigator.clipboard.writeText(value).then(()=>setNotice('Copied. Treat the clipboard as sensitive; clear it after transferring credentials.')).catch(()=>setError('Clipboard unavailable; select and copy the value manually.'))};
 return <section className="issuance-panel" aria-label="Private recipient report sharing">
  <div className="issuance-panel-title"><LockKeyhole size={20}/><div><h2>Confidential recipient sharing</h2><p>Two-administrator approval, expiry, download limits and permanent redemption audit.</p></div></div>
  {error&&<p className="issuance-error" role="alert">{error}</p>}{notice&&<p className="issuance-notice">{notice}</p>}
  <p className="issuance-small">Only reports in the current ISSUED state can be shared. Copies are private non-official evidence; no official title is certified. Deliver the link token and access code through separate trusted channels, not in the same message.</p>
  <div className="issuance-grid">
   <div><h3>Request recipient access</h3><label className="field"><span>Selected report</span><input readOnly value={reportId||'Select an issued report above'}/></label>
    <label className="field"><span>Recipient reference (internal label)</span><input maxLength={80} value={label} onChange={e=>setLabel(e.target.value)}/></label>
    <label className="field"><span>Purpose (20–500 characters)</span><textarea rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <label className="field"><span>Expires after approval (hours, 1–168)</span><input type="number" min={1} max={168} value={hours} onChange={e=>setHours(Number(e.target.value))}/></label>
    <label className="field"><span>Maximum successful redemptions (1–5)</span><input type="number" min={1} max={5} value={maximum} onChange={e=>setMaximum(Number(e.target.value))}/></label>
    <button className="button primary" disabled={!reportId||busy} type="button" onClick={propose}><ShieldCheck size={16}/> Request sharing approval</button>
   </div>
   <div><h3>Approval queue</h3>{data.shares.filter(s=>s.status==='PENDING').length?data.shares.filter(s=>s.status==='PENDING').map(s=><article className="issuance-proposal" key={s.id}><strong>{s.recipient_label}</strong><p>{s.reason}</p><small>{date(s.proposed_at)} · report {s.report_id.slice(0,8)}…</small><div className="issuance-actions"><button className="button green" disabled={busy||s.proposed_by===userId} onClick={()=>decide(s,'APPROVE')}><CheckCircle2 size={14}/> Approve</button><button className="button secondary" disabled={busy||s.proposed_by===userId} onClick={()=>decide(s,'REJECT')}><XCircle size={14}/> Reject</button></div></article>):<p className="issuance-empty">No shares awaiting independent approval.</p>}</div>
  </div>
  {created&&<div className="issuance-proposal" role="status"><strong>One-time access credentials — save securely now</strong><p>Recipient page: <code>{`${typeof window!=='undefined'?window.location.origin:'http://localhost:5173'}/#receive/report`}</code></p><label className="field"><span>Share ID (not secret)</span><input readOnly value={created.id}/></label><button type="button" className="button secondary" onClick={()=>copy(created.id)}><Copy size={14}/> Copy share ID</button><label className="field"><span>Link token — channel A</span><input readOnly value={created.accessToken}/></label><button type="button" className="button secondary" onClick={()=>copy(created.accessToken)}><Copy size={14}/> Copy link token</button><label className="field"><span>Access code — separate channel B</span><input readOnly value={created.accessCode}/></label><button type="button" className="button secondary" onClick={()=>copy(created.accessCode)}><Copy size={14}/> Copy access code</button><p className="issuance-small">No credential recovery is provided. The recipient will need the Share ID, link token, and second access code.</p><button type="button" className="button secondary" onClick={()=>setCreated(null)}>I have transferred the credentials — hide</button></div>}
  <h3>Approved shares, revocation and usage</h3>
  <label className="field"><span>Reason to revoke (20–500 characters)</span><textarea rows={2} maxLength={500} value={revokeReason} onChange={e=>setRevokeReason(e.target.value)}/></label>
  {data.shares.length?data.shares.filter(s=>s.status!=='PENDING').map(s=><article className="issuance-proposal" key={s.id}><div className="issuance-row-head"><strong>{s.recipient_label}</strong><span className="issuance-tag">{s.status}</span></div><p>Report {s.report_id.slice(0,8)}… · {s.download_count}/{s.max_downloads} redemptions · {s.expires_at?`Expires ${new Date(s.expires_at).toLocaleString()}`:'Not activated'}</p>{s.status==='ACTIVE'&&<button type="button" className="button secondary" disabled={busy||revokeReason.length<20} onClick={()=>revoke(s)}><AlertTriangle size={15}/> Revoke access</button>}</article>):<p className="issuance-empty">No reviewed shares yet.</p>}
  <button type="button" className="button secondary" disabled={busy} onClick={()=>void reload()}><RefreshCw size={15}/> Refresh share audit</button>
  <h3>Recent access security warnings</h3>
  <p className="issuance-small">Five or more unsuccessful credential attempts against a share within fifteen minutes are flagged here. Ten attempts temporarily block all redemption for that share. Review suspicious activity and revoke compromised shares.</p>
  {data.security?.length?data.security.slice(0,20).map(w=><p className="issuance-error" role="status" key={w.share_id}><AlertTriangle size={15}/> Share {w.share_id.slice(0,8)}… · {w.failed_count}/10 failed attempts · last {date(w.last_failed_at)} {w.failed_count>=10?'· temporarily blocked':''}</p>):<p className="issuance-empty">No recent security warnings.</p>}
  <h3>Recent successful redemptions</h3>{data.redemptions.length?data.redemptions.slice(0,12).map(e=><p className="issuance-small" key={e.id}>Share {e.share_id.slice(0,8)}… · {date(e.redeemed_at)} · PDF SHA-256 {e.pdf_sha256.slice(0,16)}…</p>):<p className="issuance-empty">No recipient redemption records yet.</p>}
 </section>;
}
