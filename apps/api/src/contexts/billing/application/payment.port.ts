import type {Invoice,PaymentObservation,Transition,Subscription,Catalog} from '../domain/commercial-policy';
/** A reviewed deployment adapter owns provider credentials, authenticity,
 * canonical transaction identity, cancellation and independent observations.
 * No adapter is registered by this foundation. */
export interface PaymentPort{
 readonly providerId:string;
 observe(transactionId:string,signal?:AbortSignal):Promise<PaymentObservation|null>;
}
/** Persistence must enforce organization scope, global uniqueness of paymentKey
 * across invoices, revision CAS, and atomic ledger + invoice + audit writes.
 * Do not implement payment settlement by accepting client assertions. */
export interface BillingTransaction{
 approvedCatalog():Promise<Catalog|null>;
 invoice(organizationId:string,id:string):Promise<Invoice|null>;
 commit(organizationId:string,expectedRevision:number,transition:Transition):Promise<boolean>;
 createSubscription(organizationId:string,subscription:Subscription):Promise<boolean>;
}
export interface BillingRepository{
 transaction<T>(organizationId:string,work:(tx:BillingTransaction)=>Promise<T>):Promise<T>;
}
