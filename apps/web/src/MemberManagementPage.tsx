import React,{useState,useEffect} from 'react';
import {api,post,DEMO} from './api';
import {Users,ShieldCheck,LockKeyhole,UserCheck,UserX,RefreshCw,AlertTriangle,CheckCircle2,Clock3,FileCheck2,KeyRound} from 'lucide-react';

type Role='ORG_ADMIN'|'CLIENT'|'REVIEWER'|'SURVEYOR'|'LEGAL_REVIEWER';
type Member={id:string;full_name:string;email:string;role:Role;professional_approved:boolean;suspended_at:string|null;created_at:string};
type RoleDefinition={role:Role;name:string;summary:string;permissions:readonly string[];grantPath:string};
type Change={id:string;target_user_id:string;target_name:string;target_email:string;expected_role:string;proposed_role:string;reason:string;status:string;proposed_by:string;decided_by?:string|null;proposed_at:string};
const ROLES:RoleDefinition[]=[
 {role:'ORG_ADMIN',name:'Organization administrator',summary:'Administration and independent final review',permissions:['team.manage','settings.manage','cases.final_review'],grantPath:'Separate co-admin invitation'},
 {role:'CLIENT',name:'Client / contributor',summary:'Permitted asset and case access',permissions:['assets.read_scoped','cases.request_scoped'],grantPath:'Independent administrator approval'},
 {role:'REVIEWER',name:'Evidence reviewer',summary:'Assigned non-specialist review work',permissions:['evidence.review_assigned'],grantPath:'Independent administrator approval'},
 {role:'SURVEYOR',name:'Surveyor candidate',summary:'Accreditation-gated field inspection',permissions:['field.review_if_accredited'],grantPath:'Independent approval and vetting'},
 {role:'LEGAL_REVIEWER',name:'Legal reviewer candidate',summary:'Accreditation-gated legal review',permissions:['legal.review_if_accredited'],grantPath:'Independent approval and vetting'}
];
const DEMO_MEMBERS:Member[]=[
 {id:'sample-admin-1',full_name:'A. Hargreave',email:'admin@sample.test',role:'ORG_ADMIN',professional_approved:false,suspended_at:null,created_at:'2026-11-01T11:00:00Z'},
 {id:'sample-admin-2',full_name:'Joan N.',email:'joan@example.test',role:'ORG_ADMIN',professional_approved:false,suspended_at:null,created_at:'2026-11-03T11:00:00Z'},
 {id:'sample-member-1',full_name:'Sarah K.',email:'sarah@example.test',role:'REVIEWER',professional_approved:false,suspended_at:null,created_at:'2026-11-04T11:00:00Z'},
 {id:'sample-member-2',full_name:'David M.',email:'david@example.test',role:'SURVEYOR',professional_approved:true,suspended_at:null,created_at:'2026-11-05T11:00:00Z'},
 {id:'sample-member-3',full_name:'Mary T.',email:'mary@example.test',role:'CLIENT',professional_approved:false,suspended_at:'2026-11-07T09:00:00Z',created_at:'2026-11-06T11:00:00Z'}
];
const DEMO_CHANGES:Change[]=[{id:'sample-pending',target_user_id:'sample-member-1',target_name:'Sarah K.',target_email:'sarah@example.test',expected_role:'REVIEWER',proposed_role:'LEGAL_REVIEWER',reason:'Moving to supervised legal review candidate onboarding.',status:'PENDING',proposed_by:'sample-admin-2',proposed_at:'2026-11-09T11:00:00Z'}];
const nonAdminRoles=ROLES.filter(x=>x.role!=='ORG_ADMIN');
export default function MemberManagementPage({token,userId}:{token:string;userId:string}){
 const [members,setMembers]=useState<Member[]>(DEMO?DEMO_MEMBERS:[]),[roles,setRoles]=useState<RoleDefinition[]>(ROLES),[changes,setChanges]=useState<Change[]>(DEMO?DEMO_CHANGES:[]);
 const [selected,setSelected]=useState('sample-member-1'),[role,setRole]=useState<Role>('CLIENT'),[reason,setReason]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){if(DEMO)return;setLoading(true);setError('');try{const [people,cat,proposals]=await Promise.all([
  api<{members:Member[]}>('/admin-members/members',token),
  api<{roles:RoleDefinition[]}>('/admin-members/catalog',token),
  api<{changes:Change[]}>('/admin-members/role-changes',token)
 ]);setMembers(people.members);setRoles(cat.roles);setChanges(proposals.changes);
 }catch(e:any){setError(e?.message||'Could not load member governance data')}finally{setLoading(false)}}
 useEffect(()=>{void refresh()},[token]);
 const subject=members.find(m=>m.id===selected);
 async function action(name:string,task:()=>Promise<unknown>){if(DEMO){setError('This is a read-only design preview. No membership changes have been made.');return}setBusy(name);setNotice('');setError('');try{const result:any=await task();setNotice(result.notice||'Change applied and audited.');setReason('');await refresh()}catch(e:any){setError(e?.message||'Operation failed')}finally{setBusy('')}}
 async function propose(){if(!subject)return;await action('propose',()=>post(`/admin-members/members/${subject.id}/role-changes`,token,{role,reason}))}
 async function status(mode:'SUSPEND'|'RESTORE'){if(!subject)return;await action('status',()=>post(`/admin-members/members/${subject.id}/status`,token,{action:mode,reason}))}
 async function decide(change:Change,decision:'APPROVE'|'REJECT'){await action(change.id,()=>post(`/admin-members/role-changes/${change.id}/decision`,token,{decision}))}
 return <div className="admin-console members-console">
  <div className="admin-eyebrow"><ShieldCheck size={15}/> PLATFORM GOVERNANCE / ACCESS CONTROL</div>
  <div className="admin-heading"><div><h1>Members <em>& Permissions</em></h1><p>Manage organization membership safely, request role changes and review access boundaries.</p></div><button className="button secondary" disabled={loading||!!busy} onClick={()=>void refresh()}><RefreshCw size={16}/> Refresh</button></div>
  <div className="admin-scope-tabs"><a className="member-nav-link" href="#admin">Configuration</a><a className="member-nav-link active" href="#members">Members & Permissions</a><a className="member-nav-link" href="#team">Team invitations</a><a className="member-nav-link" href="#security">MFA security</a></div>
  <div className="admin-alert"><LockKeyhole size={20}/><div><strong>Role changes require an independent administrator.</strong><p>Every member change requires recent MFA. Newly assigned surveyors or legal reviewers are candidates until separately accredited. `ORG_ADMIN` is never granted through this interface.</p></div></div>
  {error&&<div className="admin-alert admin-alert-error" role="alert"><AlertTriangle size={17}/>{error}</div>}
  {notice&&<div className="admin-alert admin-alert-success"><CheckCircle2 size={17}/>{notice}</div>}
  <div className="admin-stats"><div><strong>{members.length}</strong><span>Organization members</span></div><div><strong>{members.filter(m=>!m.suspended_at).length}</strong><span>Active members</span></div><div><strong>{changes.filter(p=>p.status==='PENDING').length}</strong><span>Pending role approvals</span></div><div><strong>Tenant-only</strong><span>Data access boundary</span></div></div>
  <section className="admin-section"><div className="admin-section-head"><h2><Users size={19}/> Member directory</h2><span>{loading?'Loading…':'Current organization only'}</span></div>
   <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Role</th><th>Professional status</th><th>Account</th><th>Manage</th></tr></thead><tbody>{members.map(m=><tr key={m.id}><td><strong>{m.full_name}</strong><small>{m.email}</small></td><td>{m.role.replaceAll('_',' ')}</td><td><span className={'admin-status '+(m.professional_approved?'approved':'pending')}>{m.professional_approved?'Accredited':'Not accredited'}</span></td><td><span className={'admin-status '+(m.suspended_at?'rejected':'approved')}>{m.suspended_at?'Suspended':'Active'}</span></td><td>{m.role==='ORG_ADMIN'?<small>Separate privileged controls</small>:<button className="member-text-button" onClick={()=>{setSelected(m.id);setRole(m.role);setReason('')}}>Manage member</button>}</td></tr>)}{!members.length&&<tr><td colSpan={5}>No members available.</td></tr>}</tbody></table></div>
  </section>
  <div className="member-two-col"><section className="admin-section"><div className="admin-section-head"><h2><UserCheck size={19}/> Change member access</h2><span>Audited actions</span></div><div className="member-pad">
   <label className="field"><span>Select member</span><select value={selected} onChange={e=>{const m=members.find(x=>x.id===e.target.value);setSelected(e.target.value);if(m&&m.role!=='ORG_ADMIN')setRole(m.role);setReason('')}}><option value="">Select a member</option>{members.filter(m=>m.role!=='ORG_ADMIN').map(m=><option key={m.id} value={m.id}>{m.full_name} · {m.role}</option>)}</select></label>
   <label className="field"><span>Proposed role</span><select value={role} onChange={e=>setRole(e.target.value as Role)}>{nonAdminRoles.map(r=><option key={r.role} value={r.role}>{r.name}</option>)}</select></label>
   <label className="field"><span>Reason (12–500 characters)</span><textarea rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain the specific change and its business justification"/></label>
   <div className="member-buttons"><button className="button primary" disabled={!subject||!!busy||subject.role===role||!!subject.suspended_at||reason.trim().length<12} onClick={()=>void propose()}><FileCheck2 size={16}/> Request role change</button><button className="button secondary" disabled={!subject||!!busy||reason.trim().length<12} onClick={()=>void status(subject?.suspended_at?'RESTORE':'SUSPEND')}>{subject?.suspended_at?<UserCheck size={16}/>:<UserX size={16}/>} {subject?.suspended_at?'Restore account':'Suspend account'}</button></div>
   <p className="member-subnote">A suspension revokes active sessions and cancels pending role proposals. Restoration does not reactivate old sessions. Complete a new MFA step-up in Account Security before submitting.</p>
  </div></section>
  <section className="admin-section"><div className="admin-section-head"><h2><KeyRound size={19}/> Role capability catalogue</h2><span>Enforced by backend code</span></div><div className="member-role-list">{roles.map(r=><div key={r.role} className="member-role-item"><strong>{r.name}</strong><p>{r.summary}</p><small>{r.permissions.join(' · ')}</small><span>{r.grantPath}</span></div>)}</div></section></div>
  <section className="admin-section"><div className="admin-section-head"><h2><Clock3 size={19}/> Independent role approvals</h2><span>Most recent 100 proposals</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Proposed role</th><th>Reason</th><th>Status</th><th>Review</th></tr></thead><tbody>{changes.map(c=><tr key={c.id}><td><strong>{c.target_name}</strong><small>{c.target_email}</small></td><td><small>{c.expected_role} →</small><strong>{c.proposed_role}</strong></td><td>{c.reason}</td><td><span className={'admin-status '+c.status.toLowerCase()}>{c.status}</span></td><td>{c.status==='PENDING'?(c.proposed_by===userId?<small>Independent reviewer required</small>:<div className="admin-actions"><button disabled={!!busy} onClick={()=>void decide(c,'APPROVE')}>Approve</button><button disabled={!!busy} onClick={()=>void decide(c,'REJECT')}>Reject</button></div>):<small>Audited decision</small>}</td></tr>)}{!changes.length&&<tr><td colSpan={5}>No role proposals yet.</td></tr>}</tbody></table></div></section>
  <div className="admin-alert"><ShieldCheck size={19}/><div><strong>Limits of this phase</strong><p>This is a real member lifecycle and role-governance foundation, not a free-form permission-rule builder. Individual permission overrides, platform-wide member editing, and delegated administrator-policy configuration remain separate future phases.</p></div></div>
 </div>
}
