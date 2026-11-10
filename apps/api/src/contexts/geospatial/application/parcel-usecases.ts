import { assessParcelOverlap } from '../domain/parcel-overlap';
import { ParcelPolygon,parseParcelPolygon,parseBoundingBox,canReviewBoundary,ParcelDomainError } from '../domain/parcel-boundary';
export type BoundaryActor={id:string;organizationId:string;role:string;professionalApproved:boolean};
export type BoundarySource='CLIENT_SKETCH'|'FIELD_SURVEY'|'DOCUMENT_TRANSCRIPTION';
export interface BoundaryStore{
 list(actor:BoundaryActor,assetId:string):Promise<unknown[]>;
 create(actor:BoundaryActor,assetId:string,data:{geometry:ParcelPolygon;sourceKind:BoundarySource;sourceReference:string;notes:string}):Promise<unknown>;
 submit(actor:BoundaryActor,assetId:string,claimId:string):Promise<unknown>;
 review(actor:BoundaryActor,sessionId:string,assetId:string,claimId:string,decision:'ACCEPTED'|'REJECTED',notes:string):Promise<unknown>;
 search(actor:BoundaryActor,bbox:[number,number,number,number]):Promise<unknown[]>;
 overlaps(actor:BoundaryActor,assetId:string,claimId:string):Promise<Array<{intersection_sqm:number;subject_area_sqm:number;other_area_sqm:number;asset_code:string;claim_id:string}>>;
}
function limitedText(v:unknown,max:number,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new ParcelDomainError(`Text must be ${required?'nonempty ':''}and no longer than ${max} characters`);return v.trim()}
export class ParcelUseCases{
 constructor(private readonly repo:BoundaryStore){}
 list(actor:BoundaryActor,assetId:string){return this.repo.list(actor,assetId)}
 create(actor:BoundaryActor,assetId:string,data:any){
  if(!['LAND'].includes(data?.assetType||'LAND'))throw new ParcelDomainError('Parcel geometry is for land only');
  const geometry=parseParcelPolygon(data?.geometry);
  if(!['CLIENT_SKETCH','FIELD_SURVEY','DOCUMENT_TRANSCRIPTION'].includes(data?.sourceKind))throw new ParcelDomainError('Invalid source kind');
  return this.repo.create(actor,assetId,{geometry,sourceKind:data.sourceKind,sourceReference:limitedText(data.sourceReference??'',120),notes:limitedText(data.notes??'',1000)});
 }
 submit(actor:BoundaryActor,assetId:string,claimId:string){return this.repo.submit(actor,assetId,claimId)}
 review(actor:BoundaryActor,sessionId:string,assetId:string,claimId:string,data:any){
  if(!canReviewBoundary(actor,''))throw new ParcelDomainError('An accredited surveyor must independently review the claim');
  if(!['ACCEPTED','REJECTED'].includes(data?.decision))throw new ParcelDomainError('Invalid review decision');
  const notes=limitedText(data.reviewNotes,1000,true);
  return this.repo.review(actor,sessionId,assetId,claimId,data.decision,notes)
 }
 async overlaps(actor:BoundaryActor,assetId:string,claimId:string){
  if(!actor?.id||!actor?.organizationId)throw new ParcelDomainError('Authenticated organization required');
  const rows=await this.repo.overlaps(actor,assetId,claimId);
  return rows.map(x=>({assetCode:x.asset_code,claimId:x.claim_id,...assessParcelOverlap(Number(x.intersection_sqm),Number(x.subject_area_sqm),Number(x.other_area_sqm))}));
 }
 search(actor:BoundaryActor,bbox:unknown){return this.repo.search(actor,parseBoundingBox(bbox))}
}
