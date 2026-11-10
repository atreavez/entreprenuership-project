/** Pure map domain policies: safe same-origin styles, bounded geographic requests and minimal overlays.
 * No React, MapLibre, NestJS, database or secrets are imported here.
 */
export type MapBounds=[number,number,number,number];
export function localStylePath(raw:string):string {
 if(typeof raw!=='string'||raw.includes('..')||raw.includes('//')||raw.includes('\\')||raw.includes('?')||raw.includes('#')||!/^\/maps\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.json$/.test(raw))
  throw new Error('Map style must be a same-origin /maps/*.json path; remote tile providers are disabled.');
 return raw;
}
export function mapViewport(value:number[]):MapBounds{
 if(!Array.isArray(value)||value.length!==4||value.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw Error('Invalid map bounds');
 const [w,s,e,n]=value;
 if(w< -180||e>180||s< -85||n>85||e<=w||n<=s||e-w>2||n-s>2)throw Error('Viewport outside allowed geographic search bounds');
 return [w,s,e,n];
}
type GeoLike={id?:unknown;status?:unknown;asset_code?:unknown;geometry?:{type?:unknown;coordinates?:unknown};[key:string]:unknown};
export function claimFeatures(claims:GeoLike[]){
 const features=[] as Array<{type:'Feature';id:string;geometry:{type:'Polygon';coordinates:number[][][]};properties:{claimId:string;status:string;label:string}}>;
 for(const c of claims){
  if(typeof c.id!=='string'||c.geometry?.type!=='Polygon'||!Array.isArray(c.geometry?.coordinates))continue;
  const rings=c.geometry.coordinates;
  if(rings.length!==1||!Array.isArray(rings[0])||rings[0].length<4||rings[0].length>101)continue;
  const valid=rings[0].every((p:unknown)=>Array.isArray(p)&&p.length===2&&p.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
  if(!valid)continue;
  // Deliberately do not include owner details, submitted notes, document identifiers or other PII in map feature properties.
  features.push({type:'Feature',id:c.id,geometry:{type:'Polygon',coordinates:rings as number[][][]},properties:{claimId:c.id,status:typeof c.status==='string'?c.status:'UNKNOWN',label:typeof c.asset_code==='string'?c.asset_code.slice(0,80):'Parcel claim'}});
 }
 return {type:'FeatureCollection' as const,features};
}
/** Enforces data sovereignty: a configuration error cannot silently switch to a remote tile service. */
export function assertLocalBasemapStyle(style:unknown):void{
 const s=style as Record<string,any>;
 if(!s||s.version!==8||s.sprite||s.glyphs||s.imports||!s.sources||Object.keys(s.sources).length!==1||!s.sources.basemap)throw Error('Unexpected or potentially remote basemap configuration');
 const src=s.sources.basemap;
 if(src.type!=='raster'||src.url||!Array.isArray(src.tiles)||src.tiles.length!==1||src.tiles[0]!=='/maps/tiles/{z}/{x}/{y}.png')throw Error('Basemap may load only AssetTrust same-origin raster tiles');
 if(!Array.isArray(s.layers)||s.layers.some((layer:any)=>!(['background','raster'].includes(layer?.type))|| (layer.type==='raster'&&layer.source!=='basemap')))throw Error('Unsupported basemap layers');
}
