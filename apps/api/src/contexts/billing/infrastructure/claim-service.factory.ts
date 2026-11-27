import type {Database} from '../../../database';
import type {AuditService} from '../../../audit';
import type {UserAuth} from '../../../common';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {ReconciliationService,PaymentAdapterRegistry,type ReconciliationRequest} from '../application/reconciliation.service';
import type {ClaimServiceFactory} from '../application/reconciliation-worker';
import type {JobClaim} from '../domain/reconciliation-job';
import {verifySettlementClaim} from './pg-reconciliation-jobs';
import {PgSettlementRepository} from './pg-settlement.repository';
/** Explicit composition root for a future supervised worker. Default
 * authorization is false; no provider or process is started by importing it.
 */
export class ClaimBoundServiceFactory implements ClaimServiceFactory{
 constructor(private readonly db:Database,private readonly audit:AuditService,
  private readonly registry:PaymentAdapterRegistry,private readonly identityFor:(org:string)=>UserAuth|null,
  private readonly role:string,private readonly dispatchAllowed:()=>boolean=()=>false){}
 async resolve(claim:JobClaim):Promise<ReconciliationService|null>{
  const request=claim.job.request;
  const matches=(r:ReconciliationRequest)=>r.organizationId===request.organizationId&&r.invoiceId===request.invoiceId&&r.providerId===request.providerId&&r.transactionId===request.transactionId;
  if(!this.dispatchAllowed()||!this.registry.resolve(request.providerId))return null;
  const current=await this.db.transaction(async tx=>{
   await setTenantScope(tx,request.organizationId);return verifySettlementClaim(tx,claim);
  });
  if(!current||!this.dispatchAllowed())return null;
  const gate={authorized:(r:ReconciliationRequest)=>this.dispatchAllowed()&&matches(r)};
  const repository=new PgSettlementRepository(this.db,this.audit,gate,this.identityFor,this.role,async(tx,r)=>matches(r)&&this.dispatchAllowed()&&await verifySettlementClaim(tx,claim));
  return new ReconciliationService(this.registry,gate,repository);
 }
}
