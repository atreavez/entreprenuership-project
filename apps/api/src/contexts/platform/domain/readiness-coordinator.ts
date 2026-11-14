/**
 * Stateless-between-probes, framework-free single-flight coordinator.
 * Every caller sharing the same outstanding probe receives the same result.
 * No result is cached after completion: the NEXT probe reads the DB again,
 * so security-policy drift is not hidden by a stale success cache.
 */
export class ReadinessCoordinator<T> {
 private pending:Promise<T>|undefined;
 execute(probe:()=>Promise<T>):Promise<T> {
  if(this.pending)return this.pending;
  const task=Promise.resolve().then(probe);
  // Store the unmodified task for callers, and clear on either settlement.
  // Attaching both handlers prevents an unhandled rejection on cleanup.
  this.pending=task;
  void task.then(()=>{if(this.pending===task)this.pending=undefined;},
                 ()=>{if(this.pending===task)this.pending=undefined;});
  return task;
 }
}
