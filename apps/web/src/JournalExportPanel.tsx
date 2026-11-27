import React,{useEffect,useRef,useState} from 'react';
import {api,DEMO} from './api';
export default function JournalExportPanel({token,role}:{token:string;role:string}){
 const permitted=role==='ORG_ADMIN'&&!DEMO;
 const [state,setState]=useState('UNKNOWN'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),lock=useRef(false);
 async function check(){
  const n=++generation.current;setState('UNKNOWN');setError('');
  if(!permitted)return;
  try{const r=await api<{capability:string;state:string}>('/billing/entitlements/status',token);
   if(n===generation.current&&r.capability==='BILLING.JOURNAL_EXPORT'&&['ACTIVE','GRACE','DENIED'].includes(r.state))setState(r.state);
  }catch(e){if(n===generation.current)setError(e instanceof Error?e.message:'Entitlement unavailable');}
 }
 useEffect(()=>{void check();return()=>{++generation.current;}},[token,permitted]);
 async function download(){
  if(!permitted||lock.current||!['ACTIVE','GRACE'].includes(state))return;
  lock.current=true;setBusy(true);setError('');const n=generation.current;
  try{
   const result=await api<{kind:string;entries:unknown[]}>('/billing/entitlements/journal-export',token);
   if(n!==generation.current)return;
   if(result.kind!=='ASSETTRUST_FINANCIAL_JOURNAL_EXPORT'||!Array.isArray(result.entries))throw Error('Unexpected export response');
   const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download='assettrust-financial-journal.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(n===generation.current){setState('UNKNOWN');setError(e instanceof Error?e.message:'Export unavailable');}}
  finally{lock.current=false;setBusy(false);}
 }
 return <section className="admin-section"><h2>Optional journal export</h2><p>Approved subscription access: {state}. Core billing records, verification and evidence remain independent of this optional feature. Up to 1,000 recorded journal entries; not a full accounting statement.</p>
 {error&&<div role="alert" className="admin-alert admin-alert-error">{error}</div>}
 <div className="admin-actions"><button className="button secondary" disabled={!permitted||busy} onClick={()=>void check()}>Check access</button><button className="button primary" disabled={!permitted||busy||!['ACTIVE','GRACE'].includes(state)} onClick={()=>void download()}>Export JSON journal</button></div></section>;
}
