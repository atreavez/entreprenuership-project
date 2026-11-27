import type {AnchorWorker,WorkerResult} from './anchor-worker';
export interface AnchorTenantSource{
 /** Return bounded, server-selected tenant IDs, not caller-supplied scopes. */
 nextBatch(after:string|null,limit:number):Promise<readonly string[]>;
}
type Health={running:boolean;enabled:boolean;lastStartedAt:number|null;lastFinishedAt:number|null;lastError:'CYCLE_FAILED'|null;processed:number;leaseLost:number};
export class AnchorOrchestrator{
 private cursor:string|null=null;
 private health:Health={running:false,enabled:false,lastStartedAt:null,lastFinishedAt:null,lastError:null,processed:0,leaseLost:0};
 constructor(private readonly worker:Pick<AnchorWorker,'runOne'>,private readonly source:AnchorTenantSource,
  private readonly enabled:()=>boolean,private readonly batchSize=10,private readonly now:()=>number=Date.now){
  if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>50)throw Error('Invalid anchoring batch size');
 }
 status():Readonly<Health>{return Object.freeze({...this.health,enabled:this.enabled()});}
 async tick():Promise<'SKIPPED'|'COMPLETED'|'FAILED'>{
  if(!this.enabled()||this.health.running)return 'SKIPPED';
  this.health.running=true;this.health.lastStartedAt=this.now();this.health.lastError=null;
  try{
   const tenants=await this.source.nextBatch(this.cursor,this.batchSize);
   if(tenants.length>this.batchSize||new Set(tenants).size!==tenants.length||tenants.some(t=>! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(t))||
    tenants.some((t,i)=>i===0?this.cursor!==null&&t<=this.cursor:t<=tenants[i-1]))throw Error('Invalid tenant batch');
   if(!tenants.length){this.cursor=null;return 'COMPLETED';}
   for(const tenant of tenants){
    if(!this.enabled())break;
    const result:WorkerResult=await this.worker.runOne(tenant);
    if(result==='SAVED')this.health.processed++;
    if(result==='LEASE_LOST')this.health.leaseLost++;
    this.cursor=tenant;
   }
   return 'COMPLETED';
  }catch{this.health.lastError='CYCLE_FAILED';return 'FAILED';}
  finally{this.health.running=false;this.health.lastFinishedAt=this.now();}
 }
}
