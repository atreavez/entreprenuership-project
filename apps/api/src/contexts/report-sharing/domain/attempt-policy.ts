/** AssetTrust v0.40 shared recipient failed-attempt window policy. Pure domain logic. */
export const WINDOW_MINUTES=15;
export const MAX_FAILURES=10;
export const ALERT_FAILURES=5;
export type FailureWindow={failed_count:number;window_started_at:string|Date};
/** Window expires at its boundary. Database time, not application host time, is authoritative. */
export function attemptBlocked(value:FailureWindow|null,now:Date):boolean{
 if(!value)return false;
 const start=new Date(value.window_started_at).getTime();
 const count=Number(value.failed_count);
 // Invalid time/counter is unsafe: fail closed, do not guess.
 if(!Number.isFinite(start)||!Number.isFinite(count)||count<0)return true;
 return now.getTime()-start<WINDOW_MINUTES*60_000 && count>=MAX_FAILURES;
}
