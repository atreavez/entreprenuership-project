import React,{useState} from 'react';
import {FileText,LockKeyhole,ShieldCheck,Download,AlertTriangle} from 'lucide-react';
import {DEMO} from './api';
/** Anonymous capability redemption requires TWO separately delivered 256-bit credentials; never place either in URL. */
export default function ReportRecipientPage(){
 const [shareId,setShareId]=useState(''),[accessToken,setAccessToken]=useState(''),[accessCode,setAccessCode]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const redeem=async(e:React.FormEvent)=>{e.preventDefault();setError('');setSuccess('');setBusy(true);
  try{
   if(DEMO)throw Error('This is a design preview. No private report is available.');
   const res=await fetch('/api/v1/reports/recipient/redeem',{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({shareId,accessToken,accessCode})});
   if(!res.ok)throw Error(res.status===404?'Recipient access is unavailable. The credentials may be incorrect, expired, revoked or exhausted.':`Report request failed (${res.status})`);
   const body=await res.json();if(body.schema!=='ASSETTRUST_RECIPIENT_PDF_V1'||typeof body.pdfBase64!=='string'||!body.receipt)throw Error('Unexpected report response');
   const raw=atob(body.pdfBase64);if(raw.length>3*1024*1024)throw Error('Report file is unexpectedly large');
   const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)};
   download(new Blob([bytes],{type:'application/pdf'}),`assettrust-confidential-${shareId}.pdf`);
   download(new Blob([JSON.stringify(body.receipt,null,2)],{type:'application/json'}),`assettrust-confidential-${shareId}.receipt.json`);
   setAccessToken('');setAccessCode('');setSuccess('The PDF and its matching signed receipt were prepared for download. Verify the receipt using a separately trusted public key, and confirm the current report status before relying on it.');
  }catch(e:any){setError(e.message||'Unable to redeem recipient access')}finally{setBusy(false)}
 };
 return <main className="issuance-page" style={{maxWidth:780,margin:'6vh auto',padding:24}}>
  <header className="issuance-heading"><div><span className="issuance-overline">ASSETTRUST / CONFIDENTIAL RECIPIENT ACCESS</span><h1>Receive a <em>verification report</em></h1><p>Download private non-official evidence only with credentials delivered to you by the issuing organization.</p></div></header>
  <section className="issuance-panel"><div className="issuance-panel-title"><LockKeyhole size={23}/><div><h2>Enter access credentials</h2><p>Request the Share ID, link token and second access code from the issuer. Both secrets should arrive through different trusted channels.</p></div></div>
   <form onSubmit={redeem}><label className="field"><span>Share ID</span><input autoComplete="off" spellCheck={false} value={shareId} onChange={e=>setShareId(e.target.value)} required/></label>
    <label className="field"><span>Link token</span><input type="password" autoComplete="off" spellCheck={false} value={accessToken} onChange={e=>setAccessToken(e.target.value)} required/></label>
    <label className="field"><span>Separate access code</span><input type="password" autoComplete="off" spellCheck={false} value={accessCode} onChange={e=>setAccessCode(e.target.value)} required/></label>
    <button type="submit" className="button primary" disabled={busy}><Download size={16}/> {busy?'Verifying access…':'Download PDF and signature receipt'}</button></form>
   {error&&<p className="issuance-error" role="alert"><AlertTriangle size={16}/>{error}</p>}{success&&<p className="issuance-notice" role="status"><ShieldCheck size={16}/>{success}</p>}
  </section><p className="issuance-notice"><FileText size={17}/> This is a private evidence report, not a government-issued land title. Possession of two credentials does not establish recipient identity. The receipt signs the exact PDF bytes; it is not an embedded PDF/PAdES signature.</p>
 </main>;
}
