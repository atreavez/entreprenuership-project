import {AnchorService,type AnchorPort} from './anchor-service';
import type {AnchorDispatchGate} from './anchor-worker';
import {validateSettings,type AnchorJob,type AnchorSettings} from '../domain/anchor-job-policy';
export type RegisteredAnchorAdapter=Readonly<{port:AnchorPort;networkIds:readonly string[]}>;
/** Constructed only by the deployment composition root, never from API inputs. */
export class AnchorAdapterRegistry{
 private readonly entries=new Map<string,RegisteredAnchorAdapter>();
 constructor(adapters:readonly RegisteredAnchorAdapter[]=[]){
  for(const adapter of adapters){
   const id=adapter.port.providerId;
   if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)||this.entries.has(id)||!adapter.networkIds.length||
    new Set(adapter.networkIds).size!==adapter.networkIds.length||adapter.networkIds.some(n=>!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(n)))throw Error('Invalid or duplicate registered anchor adapter');
   this.entries.set(id,Object.freeze({port:adapter.port,networkIds:Object.freeze([...adapter.networkIds])}));
  }
 }
 lookup(providerId:string,networkId:string):AnchorPort|null{
  const entry=this.entries.get(providerId);
  return entry&&entry.networkIds.includes(networkId)?entry.port:null;
 }
 get size(){return this.entries.size;}
}
export interface AnchorDispatchPolicyPort{
 current():Promise<AnchorSettings|null>;
 /** Deployment-level switch, independent of the approved requests policy. */
 authorized():boolean;
}
export class ApprovedAnchorDispatchGate implements AnchorDispatchGate{
 constructor(private readonly registry:AnchorAdapterRegistry,private readonly policy:AnchorDispatchPolicyPort){}
 async resolve(job:AnchorJob,_operation:'SUBMIT'|'VERIFY',signal?:AbortSignal):Promise<AnchorService|null>{
  if(signal?.aborted||!this.policy.authorized())return null;
  const current=await this.policy.current();
  if(signal?.aborted||!this.policy.authorized()||!current)return null;
  const active=validateSettings(current);
  if(!active.enabled||JSON.stringify(active)!==JSON.stringify(validateSettings(job.settings)))return null;
  const port=this.registry.lookup(active.target.providerId,active.target.networkId);
  if(!port)return null;
  // Recheck synchronous emergency stop at the exact adapter invocation boundary.
  // In-flight requests cannot be undone; the adapter must implement cancellation
  // and durable idempotency when an outcome is uncertain.
  const guard=()=>{if(signal?.aborted||!this.policy.authorized())throw Error('Anchor dispatch suspended');};
  return new AnchorService({
   providerId:port.providerId,
   submit:(request,s)=>{guard();return port.submit(request,s);},
   observe:(network,transaction,s)=>{guard();return port.observe(network,transaction,s);}
  });
 }
}
