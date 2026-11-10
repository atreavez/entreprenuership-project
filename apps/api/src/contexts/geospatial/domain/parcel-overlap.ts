/** Domain-only preliminary overlap classification. This is NOT cadastral adjudication,
 * a legal dispute finding or evidence that any surveyed boundary is official. */
export type OverlapSeverity='NONE'|'TRACE'|'REVIEW'|'HIGH_ATTENTION';
export type OverlapAssessment={severity:OverlapSeverity;percentageOfSmaller:number;sharedAreaSqm:number;notice:string};
export function assessParcelOverlap(sharedSqm:number,subjectSqm:number,otherSqm:number):OverlapAssessment{
 if (![sharedSqm,subjectSqm,otherSqm].every(Number.isFinite)||sharedSqm<0||subjectSqm<=0||otherSqm<=0)throw new Error('Overlap area measurements must be finite and nonnegative; parcel areas must be positive');
 const denominator=Math.min(subjectSqm,otherSqm);
 const pct=Math.min(100,100*sharedSqm/denominator);
 // Computed geographic intersections may have tiny slivers from digitization/precision.
 const severity:OverlapSeverity=sharedSqm===0?'NONE':sharedSqm<1||pct<1?'TRACE':pct>=20?'HIGH_ATTENTION':'REVIEW';
 return {severity,percentageOfSmaller:Number(pct.toFixed(2)),sharedAreaSqm:Number(sharedSqm.toFixed(2)),
  notice:'Preliminary geometric comparison of accessible private evidence only; not an official cadastral, ownership or legal dispute conclusion.'};
}
