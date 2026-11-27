/** Provider-independent anchoring contract. No chain SDK, credentials or network calls here. */
export type AnchorTarget=Readonly<{providerId:string;networkId:string;minConfirmations:number}>;
export type AnchorRequest=Readonly<{commitment:string;idempotencyKey:string;networkId:string}>;
export type AnchorReceipt=Readonly<{networkId:string;transactionId:string;commitment:string;confirmations:number;canonical:boolean}>;
export interface AnchorPort {
 readonly providerId:string;
 // Adapter must honor idempotency across retries; never create a second transaction for the same key.
 submit(request:AnchorRequest):Promise<{transactionId:string}>;
 // Trusted, server-configured adapter must independently check chain inclusion, commitment and canonicality.
 // Never populate this observation from client-supplied receipt fields.
 observe(networkId:string,transactionId:string):Promise<AnchorReceipt|null>;
}
export type AnchorOutcome=
 | {state:'NOT_CONNECTED'|'RETRY_REQUIRED';anchored:false}
 | {state:'SUBMITTED'|'PENDING'|'REORG_OR_INVALID';anchored:false;transactionId:string}
 | {state:'CONFIRMED';anchored:true;transactionId:string;confirmations:number};
const digest=/^[a-f0-9]{64}$/;
const identifier=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
function validId(value:unknown):value is string{return typeof value==='string'&&identifier.test(value);}
function validate(target:AnchorTarget,commitment:string):void{
 if(!validId(target.providerId)||!validId(target.networkId)||!Number.isSafeInteger(target.minConfirmations)||
    target.minConfirmations<1||target.minConfirmations>10000||typeof commitment!=='string'||!digest.test(commitment))
  throw Error('Invalid anchoring target or commitment');
}
export class AnchorService {
 constructor(private readonly port?:AnchorPort){}
 async submit(target:AnchorTarget,commitment:string):Promise<AnchorOutcome>{
  validate(target,commitment);
  if(!this.port)return {state:'NOT_CONNECTED',anchored:false};
  if(this.port.providerId!==target.providerId)throw Error('Anchor provider mismatch');
  const request:AnchorRequest=Object.freeze({commitment,networkId:target.networkId,
   idempotencyKey:JSON.stringify(['assettrust-anchor-v1',target.providerId,target.networkId,commitment])});
  try{
   const submitted=await this.port.submit(request);
   if(!validId(submitted?.transactionId))return {state:'RETRY_REQUIRED',anchored:false};
   return {state:'SUBMITTED',anchored:false,transactionId:submitted.transactionId};
  }catch{return {state:'RETRY_REQUIRED',anchored:false};}
 }
 async verify(target:AnchorTarget,commitment:string,transactionId:string):Promise<AnchorOutcome>{
  validate(target,commitment);
  if(!validId(transactionId))throw Error('Invalid anchor transaction identifier');
  if(!this.port)return {state:'NOT_CONNECTED',anchored:false};
  if(this.port.providerId!==target.providerId)throw Error('Anchor provider mismatch');
  try{
   const receipt=await this.port.observe(target.networkId,transactionId);
   if(receipt===null)return {state:'PENDING',anchored:false,transactionId};
   if(receipt.networkId!==target.networkId||receipt.transactionId!==transactionId||receipt.commitment!==commitment||
      receipt.canonical!==true||!Number.isSafeInteger(receipt.confirmations)||receipt.confirmations<0)
    return {state:'REORG_OR_INVALID',anchored:false,transactionId};
   if(receipt.confirmations<target.minConfirmations)return {state:'PENDING',anchored:false,transactionId};
   return {state:'CONFIRMED',anchored:true,transactionId,confirmations:receipt.confirmations};
  }catch{return {state:'RETRY_REQUIRED',anchored:false};}
 }
}
