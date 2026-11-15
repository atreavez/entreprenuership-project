import React,{useEffect,useState} from 'react';
import {ArrowLeft,KeyRound,ShieldCheck} from 'lucide-react';
import {api} from './api';

/** The reset token is read only from the URL fragment; it is never part of a network URL. */
export default function PasswordRecoveryPage({initialToken=''}:{initialToken?:string}){
 const [token]=useState(initialToken);
 const [email,setEmail]=useState('');
 const [newPassword,setNewPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const confirm=Boolean(token);
 useEffect(()=>{
  // Remove the bearer credential from browser history immediately after reading it.
  if(initialToken)history.replaceState(null,'',location.pathname+location.search+'#reset-password');
 },[initialToken]);
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');setNotice('');setBusy(true);
  try{
   if(confirm){
    if(newPassword!==confirmPassword){setError('Passwords do not match.');return}
    const result=await api<{message:string}>('/auth/password/reset/confirm','',{method:'POST',body:JSON.stringify({token,newPassword})});
    setNewPassword('');setConfirmPassword('');setNotice(result.message);
   }else{
    const result=await api<{message:string}>('/auth/password/reset/request','',{method:'POST',body:JSON.stringify({email})});
    setNotice(result.message);setEmail('');
   }
  }catch(err:any){setError(err?.message||'Recovery request could not be completed.')}finally{setBusy(false)}
 }
 return <div className="auth-page"><div className="auth-mark"><div className="brand"><span className="brand-mark"><ShieldCheck/></span><span className="brand-words"><strong>Asset<span>Trust</span></strong><small>ACCOUNT RECOVERY</small></span></div></div>
 <form className="auth-card" style={{margin:'auto',maxWidth:500}} onSubmit={submit}>
 <div className="eyebrow"><KeyRound size={16}/> SECURE PASSWORD RECOVERY</div>
 <h2>{confirm?'Choose a new password':'Recover account access'}</h2>
 <p className="muted">{confirm?'Set a different password containing at least 12 characters, letters and numbers. All prior sessions will be revoked.':'Enter your account email. If eligible, a time-limited recovery link will be delivered by our configured secure email service.'}</p>
 {!confirm?<label className="field"><span>Account email</span><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@organization.ug"/></label>:<>
 <label className="field"><span>New password</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label>
 <label className="field"><span>Repeat new password</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label></>}
 {error&&<div className="error-box" role="alert">{error}</div>}
 {notice&&<div className="notice" role="status">{notice}</div>}
 <button type="submit" disabled={busy||Boolean(notice&&confirm)} className="button primary full">{busy?'Working…':confirm?'Reset password':'Send recovery instructions'}</button>
 <button type="button" className="exp-link" onClick={()=>{window.location.hash='';}}><ArrowLeft size={15}/> Back to sign in</button>
 <p className="auth-foot">A recovery link expires after 15 minutes and can be used only once. Account MFA requirements remain in force.</p>
 </form></div>;
}
