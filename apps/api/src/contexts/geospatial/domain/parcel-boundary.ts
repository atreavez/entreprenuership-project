/**
 * Domain-only rules for privately submitted land-boundary evidence.
 * Coordinates follow GeoJSON [longitude, latitude] / WGS84 (EPSG:4326).
 * This is NOT a cadastral adjudication, ownership proof, or an authoritative survey.
 */
export type Position=[number,number];
export type ParcelPolygon={type:'Polygon';coordinates:[Position[]]};
export class ParcelDomainError extends Error{constructor(message:string){super(message);this.name='ParcelDomainError'}}
function fail(message:string):never{throw new ParcelDomainError(message)}
function orientation(a:Position,b:Position,c:Position){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function onSegment(a:Position,b:Position,p:Position){return Math.abs(orientation(a,b,p))<1e-12&&p[0]>=Math.min(a[0],b[0])-1e-12&&p[0]<=Math.max(a[0],b[0])+1e-12&&p[1]>=Math.min(a[1],b[1])-1e-12&&p[1]<=Math.max(a[1],b[1])+1e-12;}
function cross(a:Position,b:Position,c:Position,d:Position){const x=orientation(a,b,c),y=orientation(a,b,d),z=orientation(c,d,a),w=orientation(c,d,b);return (x*y<0&&z*w<0)||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
export function parseParcelPolygon(input:unknown):ParcelPolygon{
 if(!input||typeof input!=='object')fail('GeoJSON Polygon required');
 const data=input as Record<string,unknown>;
 if(data.type!=='Polygon'||!Array.isArray(data.coordinates)||data.coordinates.length!==1)fail('A single exterior Polygon ring is required; holes/multi-polygons are not supported');
 const raw=data.coordinates[0];
 if(!Array.isArray(raw)||raw.length<4||raw.length>101)fail('Polygon requires 3 to 100 vertices and must be closed');
 const pts:Position[]=raw.map((value:unknown)=>{
  if(!Array.isArray(value)||value.length!==2||value.some(x=>typeof x!=='number'||!Number.isFinite(x)))fail('Coordinates must be finite numeric [longitude,latitude] pairs');
  const [lon,lat]=value as number[];
  if(lon< -180||lon>180||lat< -90||lat>90)fail('Coordinates outside valid WGS84 range');
  return [lon,lat];
 });
 const first=pts[0],last=pts[pts.length-1];
 if(first[0]!==last[0]||first[1]!==last[1])fail('Polygon ring must be closed (first coordinate must equal last)');
 const unique=new Set(pts.slice(0,-1).map(p=>p.join(',')));
 if(unique.size!==pts.length-1)fail('Duplicate vertices are not allowed');
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 if(Math.max(...xs)-Math.min(...xs)>1||Math.max(...ys)-Math.min(...ys)>1)fail('Polygon exceeds one-degree maximum envelope');
 let twiceArea=0;for(let i=0;i<pts.length-1;i++)twiceArea+=pts[i][0]*pts[i+1][1]-pts[i+1][0]*pts[i][1];
 if(Math.abs(twiceArea)<1e-12)fail('Polygon has zero or negligible area');
 for(let i=0;i<pts.length-1;i++)for(let j=i+1;j<pts.length-1;j++){
  if(Math.abs(i-j)<=1||(i===0&&j===pts.length-2))continue;
  if(cross(pts[i],pts[i+1],pts[j],pts[j+1]))fail('Polygon edges intersect');
 }
 return {type:'Polygon',coordinates:[pts]};
}
export function parseBoundingBox(input:unknown):[number,number,number,number]{
 if(typeof input!=='string'||input.length>100)fail('BBox must be west,south,east,north');
 const parts=input.split(',');if(parts.length!==4||parts.some(p=>!p.trim()||!Number.isFinite(Number(p))))fail('BBox requires four finite numbers');
 const [west,south,east,north]=parts.map(Number);
 if(west< -180||east>180||south< -90||north>90||west>=east||south>=north)fail('Invalid bounding box');
 if(east-west>2||north-south>2)fail('Bounding box exceeds two-degree search cap');
 return [west,south,east,north];
}
export function canReviewBoundary(user:{id:string;role:string;professionalApproved:boolean},submittedBy:string){return user.role==='SURVEYOR'&&user.professionalApproved&&user.id!==submittedBy;}
