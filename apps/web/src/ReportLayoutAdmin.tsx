import React,{useEffect,useState} from 'react';
import {Palette,CheckCircle2,XCircle,ShieldCheck,RefreshCw} from 'lucide-react';
import {api,post,DEMO,date} from './api';

type Layout={headerTitle:string;footerNote:string;accentHex:string};
type Active={revision:number;layout:Layout};
type Proposal={id:string;layout:Layout;expected_revision:number;reason:string;proposed_by:string;proposed_at:string;status:string};
type Revision={revision:number;layout:Layout;approved_by:string;approved_at:string};
type Result={active:Active;proposals:Proposal[];revisions:Revision[];notice:string};
const starting:Layout={headerTitle:'ASSETTRUST   /   PRIVATE EVIDENCE REPORT',footerNote:'CONFIDENTIAL  /  ASSETTRUST PRIVATE EVIDENCE',accentHex:'#123D33'};
const empty:Result={active:{revision:0,layout:starting},proposals:[],revisions:[],notice:'PDF presentation only. Legal disclaimers and evidence are not editable.'};
export default function ReportLayoutAdmin({token,userId}:{token:string;userId:string}){
 const [data,setData]=useState<Result>(empty),[draft,setDraft]=useState<Layout>(starting);
 const [reason,setReason]=useState('Update report branding while preserving the fixed legal warning and evidence');
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{if(DEMO)return;try{const next=await api<Result>('/reports/layout',token);setData(next);setDraft(next.active.layout)}catch(e:any){setError(e.message||'Unable to retrieve approved report design')}};
 useEffect(()=>{void load()},[token]);
 const propose=async()=>{setError('');setNotice('');if(DEMO){setNotice('Preview only: no report layout was submitted.');return}
  setSaving(true);try{await post('/reports/layout/proposals',token,{layout:draft,reason,expectedRevision:data.active.revision});
   setNotice('New layout sent to a different organization administrator for approval.');await load();
  }catch(e:any){setError(e.message||'Unable to propose layout')}finally{setSaving(false)}};
 const decide=async(p:Proposal,decision:'APPROVE'|'REJECT')=>{setError('');setNotice('');if(DEMO){setNotice('Preview only: no decision saved.');return}
  setSaving(true);try{await post(`/reports/layout/proposals/${p.id}/decision`,token,{decision});
   setNotice(decision==='APPROVE'?'Approved design is now used for new PDF exports. Existing issued snapshots remain unchanged.':'Design proposal rejected.');await load();
  }catch(e:any){setError(e.message||'Unable to decide layout')}finally{setSaving(false)}};
 const pending=data.proposals.filter(p=>p.status==='PENDING');
 return <section className="issuance-panel" aria-label="Approved report PDF layout controls">
  <div className="issuance-panel-title"><Palette size={20}/><div><h2>PDF report design control</h2><p>Organization-scoped versioned layouts. Two current administrators approve each branding change; legal notices and evidence remain locked.</p></div></div>
  <div className="issuance-grid">
   <div>
    <p className="issuance-small">Active approved revision: <strong>{data.active.revision===0?'System default':`v${data.active.revision}`}</strong></p>
    <label className="field"><span>Report header title</span><input maxLength={46} value={draft.headerTitle} onChange={e=>setDraft(v=>({...v,headerTitle:e.target.value}))}/></label>
    <label className="field"><span>Footer note</span><input maxLength={58} value={draft.footerNote} onChange={e=>setDraft(v=>({...v,footerNote:e.target.value}))}/></label>
    <label className="field"><span>Header color (dark contrast)</span><input aria-label="PDF header color" type="color" value={draft.accentHex} onChange={e=>setDraft(v=>({...v,accentHex:e.target.value}))}/></label>
    <label className="field"><span>Reason for the change</span><textarea rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <button className="button primary" disabled={saving||reason.trim().length<12||pending.length>0} type="button" onClick={()=>void propose()}><ShieldCheck size={16}/> Propose design for independent approval</button>
   </div>
   <div>
    <div style={{border:'1px solid var(--border, #d7dedb)',borderRadius:12,overflow:'hidden',background:'#fff',color:'#192b29'}} aria-label="PDF branding preview">
     <div style={{background:draft.accentHex,color:'#fff',padding:'18px 14px',fontWeight:700,fontSize:14,overflowWrap:'anywhere'}}>{draft.headerTitle}</div>
     <div style={{padding:14,fontSize:12}}><strong>NOT AN OFFICIAL LAND TITLE OR OWNERSHIP CERTIFICATE</strong><p style={{margin:'10px 0'}}>Evidence report reference, date, verified findings, limitations and cryptographic receipt are fixed outside the layout editor.</p></div>
     <div style={{borderTop:'1px solid #ddd',padding:12,fontSize:11,overflowWrap:'anywhere'}}>{draft.footerNote} / Page 1 of 1</div>
    </div>
    <p className="issuance-small">Preview is illustrative; it does not generate or issue a real report. Contrast is checked by the API.</p>
    <div className="issuance-proposal"><strong>Pending design approvals ({pending.length})</strong>
     {pending.map(p=><div key={p.id}><p>{p.layout.headerTitle} · submitted {date(p.proposed_at)} by {p.proposed_by===userId?'you':'another administrator'}</p><div className="issuance-actions"><button type="button" className="button green" disabled={saving||p.proposed_by===userId} onClick={()=>void decide(p,'APPROVE')}><CheckCircle2 size={15}/> Approve</button><button type="button" className="button secondary" disabled={saving||p.proposed_by===userId} onClick={()=>void decide(p,'REJECT')}><XCircle size={15}/> Reject</button></div></div>)}
     {!pending.length&&<p className="issuance-small">No pending layout proposals.</p>}
    </div>
    <p className="issuance-small">{data.revisions.length} prior approved revision(s) retained in append-only history.</p>
    <button type="button" className="button secondary" onClick={()=>void load()}><RefreshCw size={15}/> Refresh layout history</button>
   </div>
  </div>
  {error&&<p className="issuance-error" role="alert">{error}</p>}{notice&&<p className="issuance-notice">{notice}</p>}
 </section>;
}
