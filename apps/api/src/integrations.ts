import {Controller,Get,Req,UseGuards,Module,Post,Body,Injectable,ForbiddenException} from '@nestjs/common';
import {AuthGuard,AuthModule} from './auth';
import {UserAuth,assertRole,text} from './common';
import {createHash} from 'node:crypto';
import {Database} from './database';
/** Explicitly non-government, non-blockchain proofs: verification of local audit head only. */
export function localProof(orgId:string,chainHead:string){return createHash('sha256').update(`assettrust:v1:${orgId}:${chainHead}`).digest('hex');}
@Controller('integrations')@UseGuards(AuthGuard)
class IntegrationsController {
 constructor(private db:Database){}
 @Get('local-proof')async localProof(@Req()r:any){const user=r.user as UserAuth;assertRole(user,['ORG_ADMIN']);const {rows}=await this.db.query('SELECT event_hash,event_sequence,created_at FROM audit_events WHERE organization_id=$1 ORDER BY event_sequence DESC LIMIT 1',[user.organizationId]);const head=rows[0]?.event_hash||'GENESIS';return {kind:'LOCAL_AUDIT_COMMITMENT_NOT_BLOCKCHAIN',organizationId:user.organizationId,head,proof:localProof(user.organizationId,head),lastAuditEventTime:rows[0]?.created_at||null,notice:'This is a locally computed digest. It is not an independent timestamp or external blockchain receipt.'};}
 @Get('status')status(@Req()r:any){assertRole(r.user,['ORG_ADMIN']);return {
  officialRegistry:{state:'NOT_CONNECTED',description:'No official Uganda land registry API or access agreement is configured. Manual sourced searches only.'},
  blockchain:{state:'NOT_CONNECTED',description:'No public or permissioned chain transaction has been submitted. Local audit hashes are not third-party notarization.'},
  payments:{state:'NOT_CONNECTED',description:'No mobile money, card, billing or payout gateway is configured; quotes only.'},
  maps:{state:'NOT_CONNECTED',description:'Parcel shape and coordinate geometry are not independently surveyed by this product.'},
  professionalAccreditation:{state:'MANUAL_DUAL_REVIEW_PILOT',description:'v0.6 records external manual professional checks with two independent platform attestations and role-bound expiry. This is not automated regulator integration or official endorsement.'},
  communications:{state:'MANUAL',description:'Reminders are stored, but there is no scheduled email/SMS delivery process.'}
 };}
}
@Module({imports:[AuthModule],controllers:[IntegrationsController]})export class IntegrationsModule{}
