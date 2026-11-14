import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Activity,CheckCircle2,Database,ExternalLink,LockKeyhole,RefreshCw,Server,ShieldAlert,XCircle} from 'lucide-react';
import {api,DEMO} from './api';
import {parseReadinessEvidence} from './readiness-contract';

type LiveReadiness={state:'NOT_TESTED'|'CHECKING'|'READY'|'NOT_READY';checkedAt?:string;detail:string;version?:string;migrationsVerified?:number;rlsPoliciesVerified?:number;protectedTablesVerified?:number};
type Integration={state:string;description:string};
const pendingTasks=[
 ['Live database transactions','Verify identity, audit, file encryption and case flows in PostgreSQL/PostGIS'],
 ['Browser acceptance tests','Complete React/Vite production build and Playwright tests'],
 ['Professional credentials','Authorize and independently verify reviewers against approved sources'],
 ['External integrations','Registry access, payment settlement and blockchain anchoring remain separate approvals'],
 ['Operations','Backups, restore drills, monitoring, secret rotation and penetration testing']
];
export default function DeploymentReadinessPage({token,role}:{token:string;role:string}){
 const [status,setStatus]=useState<LiveReadiness>({state:'NOT_TESTED',detail:'No live infrastructure check has been run.'});
 const [integrations,setIntegrations]=useState<Record<string,Integration>>({});
 const [error,setError]=useState('');
 const [integrationError,setIntegrationError]=useState('');
 // Prevent an old response (including an optional integration request) from
 // overwriting the result of a newer check or a different authenticated user.
 const activeProbe=useRef<AbortController|null>(null);
 const check=useCallback(async()=>{
  activeProbe.current?.abort();
  const controller=new AbortController();activeProbe.current=controller;
  const current=()=>activeProbe.current===controller&&!controller.signal.aborted;
  if(DEMO){setStatus({state:'NOT_TESTED',detail:'Static design preview: no API or database checks were performed.'});return;}
  setStatus({state:'CHECKING',detail:'Checking the same-origin API and database schema…'});
  setError('');setIntegrationError('');setIntegrations({});
  try{
   const response=await fetch('/api/v1/readyz',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
   if(!response.ok)throw new Error('Readiness endpoint returned '+response.status);
   const body=await response.json();
   if(!current())return;
   const verified=parseReadinessEvidence(body);
   setStatus({state:'READY',checkedAt:new Date().toISOString(),version:verified.version,migrationsVerified:verified.migrationsVerified,rlsPoliciesVerified:verified.rlsPoliciesVerified,protectedTablesVerified:verified.protectedTablesVerified,detail:'API, PostgreSQL, PostGIS and the recorded schema checksums responded successfully. This does not mean the product is production approved.'});
   // Optional integration errors must not alter the independent database state.
   if(role==='ORG_ADMIN')try{
    const result=await api<Record<string,Integration>>('/integrations/status',token);
    if(current())setIntegrations(result);
   }catch(e:any){if(current())setIntegrationError('Integration status could not be retrieved. Infrastructure readiness remains independently verified.');}
  }catch(e:any){
   if(!current())return;
   setStatus({state:'NOT_READY',checkedAt:new Date().toISOString(),detail:'The current API could not verify database readiness, policies and migration integrity.'});
   setError('Readiness check did not pass. Review server logs and migration status before deploying.');
  }
 },[token,role]);
 useEffect(()=>{if(!DEMO)void check();return()=>{activeProbe.current?.abort();activeProbe.current=null;}},[check]);
 const ready=status.state==='READY';
 return <main className="readiness-page">
  <header className="readiness-banner"><span className="eyebrow"><Activity size={15}/> ENGINEERING OPERATIONS · {status.version?`API v${status.version}`:'LIVE CHECK'}</span><h1>Deployment <em>Readiness</em></h1><p>A transparent view of what is checked, what is pending and what must never be assumed. A successful health probe does not certify a land record or approve production release.</p></header>
  <div className="readiness-stat-grid">
   <section className="readiness-stat"><Server size={22}/><small>API & database</small><strong className={ready?'ready-ok':status.state==='NOT_READY'?'ready-bad':'ready-wait'}>{status.state.replaceAll('_',' ')}</strong><span>{DEMO?'Illustrative preview':status.checkedAt?'Checked '+new Date(status.checkedAt).toLocaleTimeString('en-UG'):'Pending first check'}</span></section>
   <section className="readiness-stat"><Database size={22}/><small>Migration policy</small><strong className={ready&&status.migrationsVerified?'ready-ok':'ready-wait'}>{ready&&status.migrationsVerified?`${status.migrationsVerified} verified`:'Not verified'}</strong><span>Verified migration checksum ledger, reported by the running API</span></section>
   <section className="readiness-stat"><LockKeyhole size={22}/><small>Live isolation policy</small><strong className={ready&&status.rlsPoliciesVerified?'ready-ok':'ready-wait'}>{ready&&status.rlsPoliciesVerified?`${status.rlsPoliciesVerified} policies`:'Not verified'}</strong><span>{ready&&status.protectedTablesVerified?`${status.protectedTablesVerified} protected tables checked using the runtime database role`:'Readiness requires a fresh PostgreSQL policy check'}</span></section>
   <section className="readiness-stat"><ShieldAlert size={22}/><small>External approvals</small><strong className="ready-wait">Still required</strong><span>Official registry, licensing and settlements</span></section>
  </div>
  <div className="readiness-columns">
   <section className="readiness-box"><div className="readiness-heading"><h2><Database size={19}/> Infrastructure check</h2><button type="button" onClick={()=>void check()} disabled={status.state==='CHECKING'} className="button primary"><RefreshCw size={16}/> Check now</button></div><div className={'readiness-result '+(ready?'green':'amber')}>{ready?<CheckCircle2 size={22}/>:status.state==='NOT_READY'?<XCircle size={22}/>:<Activity size={22}/>}<span><strong>{status.state.replaceAll('_',' ')}</strong><small>{status.detail}</small></span></div><p className="readiness-help">Production is blocked until the full build, HTTP/PostGIS integration, backup-restore test and security assessment pass. The readiness endpoint checks only the current infrastructure and expected schema.</p>{error&&<p className="readiness-error">{error}</p>}</section>
   <section className="readiness-box"><div className="readiness-heading"><h2><LockKeyhole size={19}/> Release gates</h2><span className="readiness-tag">Evidence required</span></div><div className="readiness-checklist">{pendingTasks.map(([name,description])=><div key={name}><span className="readiness-open">○</span><div><strong>{name}</strong><small>{description}</small></div></div>)}</div></section>
  </div>
  <section className="readiness-box"><div className="readiness-heading"><h2><ExternalLink size={19}/> External integration posture</h2><span className="readiness-tag">No simulated connections</span></div>{integrationError&&<p className="readiness-error">{integrationError}</p>}{!Object.keys(integrations).length?<p className="readiness-help">{DEMO?'Preview mode does not contact external systems.':role==='ORG_ADMIN'?'Run a readiness check to obtain the configured integration status.':'Integration status is restricted to organization administrators.'}</p>:<div className="readiness-integrations">{Object.entries(integrations).map(([key,val])=><div key={key}><strong>{key.replace(/([a-z])([A-Z])/g,'$1 $2')}</strong><span className="readiness-tag">{val.state.replaceAll('_',' ')}</span><p>{val.description}</p></div>)}</div>}</section>
  <div className="readiness-disclaimer"><ShieldAlert size={19}/> This is an engineering readiness dashboard. It does not certify ownership, produce a government land search, or imply professional accreditation.</div>
 </main>
}
