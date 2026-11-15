/** Member governance domain: permissions are code-enforced, never user-supplied strings. */
export const NON_ADMIN_ROLES = ['CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER'] as const;
export type MemberRole = typeof NON_ADMIN_ROLES[number];
export type Decision = 'APPROVE'|'REJECT';
export type MemberChangeStatus = 'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED';
export const ROLE_CATALOG = Object.freeze([
 {role:'ORG_ADMIN',name:'Organization administrator',summary:'Organization management, invitations and independent final review',permissions:['team.manage','settings.manage','cases.final_review'],grantPath:'privileged co-administrator invitation only'},
 {role:'CLIENT',name:'Client / contributor',summary:'Permitted assets and their verification cases',permissions:['assets.read_scoped','cases.request_scoped'],grantPath:'independent administrator approval'},
 {role:'REVIEWER',name:'Evidence reviewer',summary:'Assigned non-specialist evidence tasks',permissions:['evidence.review_assigned'],grantPath:'independent administrator approval'},
 {role:'SURVEYOR',name:'Surveyor candidate',summary:'Field inspection only after independent accreditation',permissions:['field.review_if_accredited'],grantPath:'independent approval + professional vetting'},
 {role:'LEGAL_REVIEWER',name:'Legal reviewer candidate',summary:'Legal assessment only after independent accreditation',permissions:['legal.review_if_accredited'],grantPath:'independent approval + professional vetting'}
] as const);
export function assertNonAdminRole(input:unknown):MemberRole {
 if(typeof input!=='string'||!NON_ADMIN_ROLES.includes(input as MemberRole))throw new Error('Privileged or unsupported role. Organization administrators require the separate co-admin workflow.');
 return input as MemberRole;
}
export function assertDecision(input:unknown):Decision{
 if(input!=='APPROVE'&&input!=='REJECT')throw new Error('Decision must be APPROVE or REJECT');
 return input;
}
export function assertReason(input:unknown):string{
 if(typeof input!=='string'||input.trim().length<12||input.trim().length>500)throw new Error('A meaningful reason of 12–500 characters is required');
 return input.trim();
}
export function assertTargetRoleChange(actorId:string,target:{id:string;role:string;suspended_at?:unknown},newRole:unknown):MemberRole{
 const targetRole=assertNonAdminRole(target.role);
 const desired=assertNonAdminRole(newRole);
 if(target.id===actorId)throw new Error('You cannot change your own role');
 if(target.suspended_at)throw new Error('Suspended members cannot receive role changes');
 if(targetRole===desired)throw new Error('Select a different role');
 return desired;
}
export function assertMemberStateChange(actorId:string,target:{id:string;role:string;suspended_at?:unknown},action:unknown):'SUSPEND'|'RESTORE'{
 if(target.id===actorId)throw new Error('You cannot change your own account status');
 assertNonAdminRole(target.role); // no bypass of privileged administrator lifecycle
 if(action!=='SUSPEND'&&action!=='RESTORE')throw new Error('Invalid status action');
 if(action==='SUSPEND' && target.suspended_at)throw new Error('Member is already suspended');
 if(action==='RESTORE' && !target.suspended_at)throw new Error('Member is not suspended');
 return action;
}
