import React,{useEffect,useMemo,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {ShieldCheck,FileCheck2,RefreshCw,Clock3,CheckCircle2,XCircle,Link2,FileText,LockKeyhole,AlertTriangle,History,Download} from 'lucide-react';
import {api,post,DEMO,date} from './api';
import ReportLayoutAdmin from './ReportLayoutAdmin';
import ReportSharingAdmin from './ReportSharingAdmin';
type CaseOption={id:string;case_code:string;stage:string;status:string};
type Proposal={id:string;case_id:string;reason:string;proposed_by:string;proposed_at:string;status:string;supersedes_report_id:string|null};
type Issued={id:string;case_id:string;snapshot_sha256:string;issued_at:string;issued_by:string;supersedes_report_id:string|null};
type WithdrawalProposal={id:string;report_id:string;reason:string;proposed_by:string;proposed_at:string;status:'PENDING'|'REJECTED'|'APPROVED'};
type Withdrawal={id:string;report_id:string;approved_at:string;approved_by:string};
type Response={proposals:Proposal[];issued:Issued[];withdrawalProposals:WithdrawalProposal[];withdrawals:Withdrawal[];notice:string};
const DEMO_CASE='b3333333-b333-4333-8333-b33333333333',DEMO_REPORT='fa3466d1-6fd2-464d-a489-892fc8acd169';
const demoReports:Response={
 proposals:[{id:'preview-proposal-1',case_id:DEMO_CASE,reason:'Ready for independent approval after complete evidence review',proposed_by:'other-admin',proposed_at:'2026-11-11T09:00:00Z',status:'PENDING',supersedes_report_id:null}],
 issued:[{id:DEMO_REPORT,case_id:DEMO_CASE,snapshot_sha256:'acf1b37683a5e5523df616797aad8a161ee5eb77ae2bb1ad3bd96b3d6c2a3e42',issued_at:'2026-11-10T12:00:00Z',issued_by:'admin-2',supersedes_report_id:null}],
 withdrawalProposals:[],withdrawals:[],
 notice:'Demo records only. Issued reports never establish legal ownership.'};
function VerificationCard({report}:{report:Issued}){
 const origin=typeof window!=='undefined'&&window.location.origin?window.location.origin:'http://localhost:5173';
 const link=`${origin}/#verify/report/${report.id}`;
 return <section className="issuance-qr-card"><div className="issuance-qr-image"><QRCodeSVG value={link} size={176} marginSize={4} level="M" title="Open the non-official AssetTrust report verification page"/></div><div className="issuance-qr-copy"><strong>Public verification reference</strong><small>The QR opens an AssetTrust status and integrity check. It does not expose private evidence or prove ownership.</small><a href={link} target="_blank" rel="noopener noreferrer">Open public verification</a><button type="button" className="button secondary" onClick={()=>{void navigator.clipboard?.writeText(link)}}>Copy verification link</button><code>{report.id}</code></div></section>;
}
export default function ReportIssuancePage({token,userId}:{token:string;userId:string}){
 const [cases,setCases]=useState<CaseOption[]>(DEMO?[{id:DEMO_CASE,case_code:'AT-VC-DEMO',stage:'CLOSED',status:'CLOSED'}]:[]);
 const [data,setData]=useState<Response>(DEMO?demoReports:{proposals:[],issued:[],withdrawalProposals:[],withdrawals:[],notice:''});
 const [selected,setSelected]=useState(DEMO?DEMO_CASE:'');const [reason,setReason]=useState('Issue a private evidence summary following independent review');
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
 const [selectedReport,setSelectedReport]=useState<string|null>(DEMO?DEMO_REPORT:null);
 const [withdrawalReason,setWithdrawalReason]=useState('Material discrepancies require withdrawal pending independent professional review');
 const load=async()=>{if(DEMO)return;try{const [c,r]=await Promise.all([api<CaseOption[]>('/cases',token),api<Response>('/reports/issued',token)]);setCases(c);setData(r);}catch(e:any){setError(e.message||'Unable to load issuance records')}};
 useEffect(()=>{void load()},[token]);
 const latest=useMemo(()=>data.issued.find(r=>r.case_id===selected&&!data.issued.some(x=>x.supersedes_report_id===r.id)),[data.issued,selected]);
 const selectedRow=data.issued.find(r=>r.id===selectedReport);
 const propose=async()=>{setError('');setNotice('');if(DEMO){setNotice('Demo only. No report proposal was submitted.');return}setSaving(true);try{const result=await post('/reports/issued/proposals',token,{caseId:selected,reason,supersedesReportId:latest?.id||null});setNotice(`Proposal ${result.id} submitted for independent administrator approval.`);await load();}catch(e:any){setError(e.message||'Unable to propose issuance')}finally{setSaving(false)}};
 const decide=async(p:Proposal,decision:'APPROVE'|'REJECT')=>{setError('');setNotice('');if(DEMO){setNotice('Preview only; no administrator decision was recorded.');return}setSaving(true);try{const result=await post(`/reports/issued/proposals/${p.id}/decision`,token,{decision});setNotice(decision==='APPROVE'?'A non-official private evidence report was issued and audited.':'The issuance proposal was rejected.');if(result.reportId)setSelectedReport(result.reportId);await load();}catch(e:any){setError(e.message||'Decision failed')}finally{setSaving(false)}};
 const exportSignedBundle=async()=>{
  if(!selectedRow)return;
  setError('');setNotice('');
  if(DEMO){setNotice('Preview only: signed exports require a real authenticated report and a configured server signing key.');return}
  setSaving(true);
  try{
   const bundle=await api<any>(`/reports/issued/${selectedRow.id}/signed-export`,token);
   if(bundle?.schema!=='ASSETTRUST_SIGNED_EVIDENCE_BUNDLE_V1'||bundle?.payload?.reportId!==selectedRow.id)throw Error('Unexpected signed export response');
   const blob=new Blob([JSON.stringify(bundle,null,2)+'\n'],{type:'application/json'});
   const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`assettrust-signed-evidence-${selectedRow.id}.json`;
   document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
   setNotice('Signed private evidence bundle exported. Verify its signature with a separately trusted public key; always recheck the latest report status.');
  }catch(e:any){setError(e.message||'Signed export unavailable')}finally{setSaving(false)}
 };
 const exportSignedPdf=async()=>{
  if(!selectedRow)return;
  setError('');setNotice('');
  if(DEMO){setNotice('Preview only: PDF exports need an authenticated issued report and a configured signing key.');return}
  setSaving(true);
  try{
   const response=await api<any>(`/reports/layout/export/${selectedRow.id}`,token);
   if(response?.schema!=='ASSETTRUST_PDF_DOWNLOAD_V1'||response?.reportId!==selectedRow.id||!response?.receipt||typeof response?.pdfBase64!=='string')throw Error('Unexpected PDF export response');
   // Validate the returned base64 minimally. Cryptographic verification happens offline with pinned keys.
   const raw=atob(response.pdfBase64);
   if(raw.length<100||raw.slice(0,8)!=='%PDF-1.4')throw Error('PDF export response was malformed');
   const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
   download(new Blob([bytes],{type:'application/pdf'}),`assettrust-report-${selectedRow.id}.pdf`);
   download(new Blob([JSON.stringify(response.receipt,null,2)+'\n'],{type:'application/json'}),`assettrust-report-${selectedRow.id}.receipt.json`);
   setNotice('Confidential PDF and detached signature receipt downloaded. Keep both files together and verify against a separately trusted public key.');
  }catch(e:any){setError(e.message||'Unable to export signed report PDF')}finally{setSaving(false)}
 };
 const proposeWithdrawal=async()=>{setError('');setNotice('');if(DEMO){setNotice('Demo only: no withdrawal requested.');return}if(!selectedRow)return;setSaving(true);try{await post('/reports/issued/withdrawals',token,{reportId:selectedRow.id,reason:withdrawalReason});setNotice('Withdrawal proposed. The report remains issued until another administrator approves.');await load();}catch(e:any){setError(e.message||'Unable to propose withdrawal')}finally{setSaving(false)}};
 const decideWithdrawal=async(p:WithdrawalProposal,vote:'APPROVE'|'REJECT')=>{setError('');setNotice('');if(DEMO){setNotice('Demo only: no withdrawal decision recorded.');return}setSaving(true);try{await post(`/reports/issued/withdrawals/${p.id}/decision`,token,{decision:vote});setNotice(vote==='APPROVE'?'Report withdrawn: public verification now warns against relying on the report.':'Withdrawal rejected; report remains unchanged.');await load();}catch(e:any){setError(e.message||'Unable to decide withdrawal')}finally{setSaving(false)}};
 return <main className="issuance-page">
  <header className="issuance-heading"><div><span className="issuance-overline">ADMIN CONTROL PLANE / EVIDENCE GOVERNANCE</span><h1>Report <em>Issuance</em></h1><p>Approve, issue and independently verify permanent non-official evidence snapshots. Never represent a private report as an official land-title certificate.</p></div><button type="button" className="button secondary" onClick={()=>void load()}><RefreshCw size={16}/> Refresh</button></header>
  <ReportLayoutAdmin token={token} userId={userId}/>
  <div className="issuance-summary"><div className="issuance-metric"><span>Awaiting independent approval</span><strong>{data.proposals.filter(x=>x.status==='PENDING').length}</strong><small><Clock3 size={14}/> Two current administrators required</small></div><div className="issuance-metric"><span>Issued evidence reports</span><strong>{data.issued.length}</strong><small><ShieldCheck size={14}/> Versioned / append-only</small></div><div className="issuance-metric"><span>Public verification</span><strong>QR</strong><small><LockKeyhole size={14}/> Metadata only</small></div></div>
  {DEMO&&<p className="issuance-notice"><AlertTriangle size={17}/> Preview mode: all cases, approvals and report IDs shown here are fictional.</p>}
  {error&&<p className="issuance-error" role="alert">{error}</p>}{notice&&<p className="issuance-notice">{notice}</p>}
  <div className="issuance-grid"><section className="issuance-panel"><div className="issuance-panel-title"><FileText size={20}/><div><h2>Propose an issuance</h2><p>Only fully closed cases with independently accepted evidence and no unresolved disputes qualify.</p></div></div>
   <label className="field"><span>Closed verification case</span><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a completed case</option>{cases.filter(c=>c.status==='CLOSED'&&c.stage==='CLOSED').map(c=><option value={c.id} key={c.id}>{c.case_code}</option>)}</select></label>
   <label className="field"><span>Reason for issuance</span><textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {latest&&<p className="issuance-notice"><History size={15}/> This will propose a superseding report. The earlier report remains verifiable as superseded.</p>}
   <button className="button primary" type="button" disabled={!selected||saving||reason.trim().length<12} onClick={()=>void propose()}><FileCheck2 size={17}/> Propose for independent approval</button>
   <p className="issuance-small">Pending proposals are not public and are not issued documents. MFA and current administrator privileges are checked on the server.</p>
  </section>
  <section className="issuance-panel"><div className="issuance-panel-title"><Clock3 size={20}/><div><h2>Approval queue</h2><p>Authors cannot approve their own proposals.</p></div></div>
   {data.proposals.filter(p=>p.status==='PENDING').length?data.proposals.filter(p=>p.status==='PENDING').map(p=><article className="issuance-proposal" key={p.id}><div className="issuance-row-head"><strong>{cases.find(c=>c.id===p.case_id)?.case_code||p.case_id.slice(0,8)}</strong><span className="issuance-tag">PENDING</span></div><p>{p.reason}</p><small>Submitted {date(p.proposed_at)}</small><div className="issuance-actions"><button className="button green" disabled={saving||userId===p.proposed_by} onClick={()=>void decide(p,'APPROVE')}><CheckCircle2 size={16}/> Approve & issue</button><button className="button secondary" disabled={saving||userId===p.proposed_by} onClick={()=>void decide(p,'REJECT')}><XCircle size={16}/> Reject</button></div>{userId===p.proposed_by&&<small>Independent approval required — you submitted this proposal.</small>}</article>):<p className="issuance-empty">No report issuance proposals are awaiting review.</p>}
  </section></div>
  <section className="issuance-panel"><div className="issuance-panel-title"><ShieldCheck size={20}/><div><h2>Issued reports & verification</h2><p>Every issued snapshot is stored with an integrity fingerprint. Corrections create new reports rather than silently rewriting old ones.</p></div></div>
    <div className="issuance-reports">{data.issued.length?data.issued.map(r=><button key={r.id} type="button" className={'issuance-report-item '+(r.id===selectedReport?'selected':'')} onClick={()=>setSelectedReport(r.id)}><FileCheck2 size={19}/><span><strong>{cases.find(c=>c.id===r.case_id)?.case_code||'Private verification report'}</strong><small>{date(r.issued_at)} · SHA-256 {r.snapshot_sha256.slice(0,15)}…</small></span><span className="issuance-tag">{data.withdrawals.some(w=>w.report_id===r.id)?'WITHDRAWN':data.issued.some(x=>x.supersedes_report_id===r.id)?'SUPERSEDED':'ISSUED'}</span></button>):<p className="issuance-empty">No issued reports yet.</p>}</div>
    {selectedRow&&<><VerificationCard report={selectedRow}/><div className="issuance-actions"><button type="button" className="button secondary" disabled={saving} onClick={()=>void exportSignedBundle()}><LockKeyhole size={16}/> Download signed evidence bundle (.json)</button><button type="button" className="button secondary" disabled={saving} onClick={()=>void exportSignedPdf()}><Download size={16}/> Download report PDF + verification receipt</button></div><p className="issuance-small">Confidential export for authorized administrators only. Ed25519 verifies the downloaded content against a separately trusted public key. The current status can change. The PDF has a separate Ed25519-signed receipt, not a PDF-native PAdES signature or official land registry certificate. Save and verify both files.</p></>}
  </section>
  <ReportSharingAdmin token={token} userId={userId} reportId={selectedRow?.id}/>
  <section className="issuance-panel"><div className="issuance-panel-title"><AlertTriangle size={20}/><div><h2>Emergency report withdrawal</h2><p>Withdraw a misleading or unsafe report through dual approval. Its original snapshot and audit history are never deleted. The private reason is visible to authorized administrators only.</p></div></div>
   <label className="field"><span>Selected report</span><input value={selectedRow?.id||'Select an issued report above'} readOnly/></label>
   <label className="field"><span>Confidential reason for withdrawal (20–1000 characters)</span><textarea value={withdrawalReason} rows={3} maxLength={1000} onChange={e=>setWithdrawalReason(e.target.value)}/></label>
   {selectedRow&&data.withdrawals.some(w=>w.report_id===selectedRow.id)&&<p className="issuance-notice">This report is already withdrawn. It cannot be restored or silently edited.</p>}
   <button type="button" className="button secondary" disabled={!selectedRow||saving||withdrawalReason.trim().length<20||Boolean(selectedRow&&data.withdrawals.some(w=>w.report_id===selectedRow.id))} onClick={()=>void proposeWithdrawal()}><AlertTriangle size={16}/> Request independent withdrawal</button>
   <h3>Withdrawal approval queue</h3>
   {data.withdrawalProposals.filter(p=>p.status==='PENDING').length?data.withdrawalProposals.filter(p=>p.status==='PENDING').map(p=><article className="issuance-proposal" key={p.id}><div className="issuance-row-head"><strong>Report {p.report_id.slice(0,8)}…</strong><span className="issuance-tag">WITHDRAWAL PENDING</span></div><p>{p.reason}</p><small>Submitted {date(p.proposed_at)}</small><div className="issuance-actions"><button type="button" className="button primary" disabled={saving||userId===p.proposed_by} onClick={()=>void decideWithdrawal(p,'APPROVE')}><CheckCircle2 size={16}/> Approve withdrawal</button><button type="button" className="button secondary" disabled={saving||userId===p.proposed_by} onClick={()=>void decideWithdrawal(p,'REJECT')}><XCircle size={16}/> Reject withdrawal</button></div>{userId===p.proposed_by&&<small>You cannot decide your own withdrawal proposal.</small>}</article>):<p className="issuance-empty">No report withdrawals await independent review.</p>}
  </section>
  <p className="issuance-notice"><AlertTriangle size={18}/> The report SHA-256 digest is local tamper evidence, not an external digital signature or blockchain anchor. Official title verification remains with the competent authorities.</p>
 </main>;
}
