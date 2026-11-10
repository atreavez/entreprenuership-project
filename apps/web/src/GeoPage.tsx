import React,{useEffect,useMemo,useState} from 'react';
import {MapPin,Layers3,Compass,Search,ShieldCheck,AlertTriangle,Plus,RefreshCw,CheckCircle2,Clock3,Map,Scale,FileText,Navigation2,Send,SearchCheck} from 'lucide-react';
import {api,post,DEMO} from './api';
import {fixtureAssets} from './fixtures';
import LocalMap from './map/LocalMap';
type OverlapFinding={assetCode:string;claimId:string;severity:'NONE'|'TRACE'|'REVIEW'|'HIGH_ATTENTION';percentageOfSmaller:number;sharedAreaSqm:number;notice:string};
type P=[number,number];
type Polygon={type:'Polygon';coordinates:[P[]]};
type Claim={id:string;asset_id:string;geometry:Polygon;status:string;source_kind:string;source_reference:string;notes:string;submitted_by:string;reviewed_by?:string|null;created_at:string;area_sqm:number;asset_code?:string;district?:string};
const sample:Claim[]=[
 {id:'parcel-101',asset_id:'demo-1',asset_code:'AT-LA-30821',district:'Wakiso',geometry:{type:'Polygon',coordinates:[[[32.57,0.304],[32.585,0.306],[32.591,0.317],[32.583,0.329],[32.568,0.322],[32.57,0.304]]]},status:'SUBMITTED',source_kind:'FIELD_SURVEY',source_reference:'Illustrative survey sketch — NOT official',notes:'Sample submitted outline for preview only.',submitted_by:'demo-surveyor-2',created_at:'2026-11-06T10:00:00Z',area_sqm:2136500},
 {id:'parcel-102',asset_id:'demo-3',asset_code:'AT-LA-09872',district:'Mukono',geometry:{type:'Polygon',coordinates:[[[32.737,0.349],[32.752,0.353],[32.754,0.368],[32.741,0.371],[32.737,0.349]]]},status:'DRAFT',source_kind:'CLIENT_SKETCH',source_reference:'Fictional user sketch',notes:'Not independently reviewed.',submitted_by:'demo-user',created_at:'2026-11-06T09:00:00Z',area_sqm:2203400},
 {id:'parcel-103',asset_id:'demo-5',asset_code:'AT-LA-28539',district:'Entebbe',geometry:{type:'Polygon',coordinates:[[[32.468,0.074],[32.482,0.078],[32.481,0.09],[32.471,0.092],[32.468,0.074]]]},status:'REJECTED',source_kind:'DOCUMENT_TRANSCRIPTION',source_reference:'Illustrative disputed copy',notes:'Mismatch requires additional evidence.',submitted_by:'demo-user',created_at:'2026-11-06T09:00:00Z',area_sqm:1982200}
];
const W=760,H=465;
function prettyStatus(value:string){return value.toLowerCase().replace(/^./,v=>v.toUpperCase())}
const initialGeometry='32.57000, 0.30400\n32.58500, 0.30600\n32.59100, 0.31700\n32.58300, 0.32900\n32.56800, 0.32200';
export default function GeoPage({token}:{token:string}){
 const [tileUnavailable,setTileUnavailable]=useState(false);
 const mapConfigured = !DEMO && import.meta.env.VITE_SELF_HOSTED_MAP_ENABLED === 'true';
 const localTilesEnabled = mapConfigured && !tileUnavailable;
 const localStylePath = import.meta.env.VITE_LOCAL_MAP_STYLE_PATH || '/maps/style.json';
 const [assets,setAssets]=useState(fixtureAssets.filter(a=>a.asset_type==='LAND'));
 const [claims,setClaims]=useState<Claim[]>(DEMO?sample:[]);
 const [selected,setSelected]=useState('parcel-101');
 const [assetId,setAssetId]=useState(DEMO?'demo-1':'');
 const [coords,setCoords]=useState(DEMO?initialGeometry:'');
 const [bbox,setBBox]=useState('32.41,0.025,32.85,0.49');
 const [viewport,setViewport]=useState<[number,number,number,number]>([32.41,0.025,32.85,0.49]);
 const x=(lon:number)=>(lon-viewport[0])/(viewport[2]-viewport[0])*W;
 const y=(lat:number)=>(viewport[3]-lat)/(viewport[3]-viewport[1])*H;
 const [sourceKind,setSourceKind]=useState('CLIENT_SKETCH');
 const [sourceRef,setSourceRef]=useState('');
 const [message,setMessage]=useState('');
 const [search,setSearch]=useState('');
 const [busy,setBusy]=useState(false);
 const [zoom,setZoom]=useState(1);
 const [overlaps,setOverlaps]=useState<OverlapFinding[]>([]);
 const [overlapLoading,setOverlapLoading]=useState(false);
 const [overlapError,setOverlapError]=useState('');
 const [reviewNotes,setReviewNotes]=useState('');
 const [reviewDecision,setReviewDecision]=useState('ACCEPTED');
 async function reload(region?:string){if(DEMO)return;try{const area=region||bbox;const [a,c]=await Promise.all([api<any[]>('/assets?type=LAND',token),api<Claim[]>('/geo/parcels?bbox='+encodeURIComponent(area),token)]);setAssets(a);setClaims(c);setAssetId(current=>a.some(item=>item.id===current)?current:a[0]?.id||'');if(region){setViewport(area.split(',').map(Number) as [number,number,number,number]);setBBox(area);}setMessage('')}catch(e:any){setMessage(e.message)}}
 useEffect(()=>{reload()},[token]);
 const chosen=claims.find(p=>p.id===selected)||claims[0];
 useEffect(()=>{
  // Query one asset at a time; old responses must never replace a newly selected parcel.
  let current=true;setOverlaps([]);setOverlapError('');
  if(DEMO||!chosen)return;
  setOverlapLoading(true);
  api<OverlapFinding[]>(`/geo/assets/${chosen.asset_id}/parcels/${chosen.id}/overlaps`,token)
    .then(items=>{if(current)setOverlaps(items)})
    .catch(error=>{if(current)setOverlapError(String(error.message||error))})
    .finally(()=>{if(current)setOverlapLoading(false)});
  return()=>{current=false};
 },[chosen?.id,token]);
 const filtered=useMemo(()=>claims.filter(p=>`${p.asset_code} ${p.district} ${p.status}`.toLowerCase().includes(search.toLowerCase())),[claims,search]);
 const total=claims.length,accepted=claims.filter(p=>p.status==='ACCEPTED').length,pending=claims.filter(p=>p.status==='SUBMITTED').length;
 function parseInput():Polygon{const points=coords.trim().split(/\n/).map(line=>line.split(',').map(Number));if(points.length<3||points.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n))))throw Error('Enter at least 3 valid longitude, latitude coordinate pairs.');return {type:'Polygon',coordinates:[[...points as P[],points[0] as P]]};}
 async function create(){try{if(DEMO)throw Error('Design preview is read-only.');setBusy(true);setMessage('');const result=await post<{id:string}>(`/geo/assets/${assetId}/parcels`,token,{geometry:parseInput(),sourceKind,sourceReference:sourceRef,notes:'Privately submitted geometry. Not an authoritative land boundary.'});await reload();setSelected(result.id);setMessage('Draft saved. Submit it for independent professional review.')}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
 async function submit(){if(!chosen)return;try{if(DEMO)throw Error('Design preview is read-only.');setBusy(true);await post(`/geo/assets/${chosen.asset_id}/parcels/${chosen.id}/submit`,token,{});await reload();setMessage('Claim submitted; independent surveyor review is required.')}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
 async function review(){if(!chosen)return;try{if(DEMO)throw Error('Design preview is read-only.');setBusy(true);await post(`/geo/assets/${chosen.asset_id}/parcels/${chosen.id}/review`,token,{decision:reviewDecision,reviewNotes});await reload();setMessage('Review decision recorded in the audit trail.')}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
 return <div className="geo-page">
  <div className="geo-header"><div className="geo-kicker"><MapPin size={16}/> SPATIAL INTELLIGENCE · WGS84</div><h1>Land <em>intelligence</em></h1><p>Private parcel boundaries, survey evidence and accountable reviews. A boundary on this map does <b>not</b> confirm ownership or government registration.</p></div>
  <div className="geo-stats"><div><Layers3 size={19}/><small>Private outlines</small><strong>{total}</strong></div><div><ShieldCheck size={19}/><small>Peer-reviewed</small><strong>{accepted}</strong></div><div><Clock3 size={19}/><small>Awaiting review</small><strong>{pending}</strong></div><div><Map size={19}/><small>Coordinate system</small><strong>EPSG:4326</strong></div></div>
  <div className="geo-layout">
   <section className="geo-map-panel"><div className="geo-panel-head"><div><strong><Compass size={19}/> Private boundary viewer</strong><small>{localTilesEnabled?'Self-hosted licensed basemap · private overlays':tileUnavailable?'Offline fallback: tile server unavailable':'Coordinate grid only · turn on local tiles when ready'}</small></div><div className="geo-map-tools"><button title="Zoom out" onClick={()=>setZoom(Math.max(1,zoom-.25))}>−</button><button title="Zoom in" onClick={()=>setZoom(Math.min(2,zoom+.25))}>+</button><button title="Reset zoom" onClick={()=>setZoom(1)}><RefreshCw size={15}/></button></div></div>
    <div className="geo-bbox"><label>Map viewport (west, south, east, north)<input aria-label="Map bounds" value={bbox} onChange={e=>setBBox(e.target.value)}/></label><button onClick={()=>reload(bbox)}>Load area</button></div><div className="geo-map">{localTilesEnabled&&<LocalMap claims={claims} selectedId={chosen?.id||''} viewport={viewport} stylePath={localStylePath} onSelect={setSelected} onUnavailable={()=>setTileUnavailable(true)} onViewportChange={bounds=>setBBox(bounds.map(n=>n.toFixed(5)).join(','))}/>}<svg style={localTilesEnabled?{display:'none'}:{}} role="img" aria-label="Private coordinate plot of submitted parcel outlines" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs><pattern id="geo-grid" width="52" height="52" patternUnits="userSpaceOnUse"><path d="M52 0H0V52" fill="none" stroke="#73906d" strokeWidth=".5" opacity=".33"/></pattern><linearGradient id="geo-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bfa052" stopOpacity=".3"/><stop offset="1" stopColor="#32ba71" stopOpacity=".15"/></linearGradient></defs>
      <rect x="0" y="0" width={W} height={H} fill="#102018"/><rect x="0" y="0" width={W} height={H} fill="url(#geo-grid)"/>
      {Array.from({length:9},(_,i)=><path key={i} d={`M ${-70+i*110} 0 Q ${130+i*75} 140 ${-20+i*120} 250 T ${180+i*75} 465`} fill="none" stroke="#355b39" strokeWidth="1.2" opacity=".42"/>)}
      <g transform={`translate(${W/2} ${H/2}) scale(${zoom}) translate(${-W/2} ${-H/2})`}>
       {claims.map(p=>{const selectedNow=chosen?.id===p.id;const points=p.geometry.coordinates[0].map(([lon,lat])=>`${x(lon)},${y(lat)}`).join(' ');const center=p.geometry.coordinates[0].slice(0,-1).reduce((s,c)=>[s[0]+c[0]/(p.geometry.coordinates[0].length-1),s[1]+c[1]/(p.geometry.coordinates[0].length-1)],[0,0]);return <g key={p.id} onClick={()=>setSelected(p.id)} className="geo-map-shape" role="button" aria-label={`Select ${p.asset_code||p.id}`}><polygon points={points} fill={selectedNow?'url(#geo-fill)':'#184b31'} fillOpacity={selectedNow?.98:.55} stroke={selectedNow?'#eec66c':'#2cbd79'} strokeWidth={selectedNow?3:1.6} strokeLinejoin="round"/><circle cx={x(center[0])} cy={y(center[1])} r={selectedNow?6:4} fill="#f3d177"/><text x={x(center[0])+9} y={y(center[1])-12} fill="#f8edd4" fontSize="13" paintOrder="stroke" stroke="#101a15" strokeWidth="4">{p.asset_code||'Draft'}</text></g>})}
      </g>
      <text x="17" y="29" fontSize="14" fill="#ebd094">PRIVATE PARCEL EVIDENCE • UGANDA</text><text x="17" y={H-15} fontSize="12" fill="#aac1ac">WGS84 longitude / latitude • schematic coordinate grid</text><text x={W-170} y={H-15} fontSize="12" fill="#9ec7af">No official cadastral data</text>
     </svg><div className="geo-map-badge"><span/> {localTilesEnabled?'Self-hosted basemap + access-controlled claims':tileUnavailable?'Fallback: local tiles unavailable':'No background tiles · coordinate grid'}</div></div>
    <div className="geo-map-legend"><span><i className="geo-legend-gold"/> Selected boundary</span><span><i className="geo-legend-green"/> Other submitted outline</span><span>Zoom: {Math.round(zoom*100)}%</span></div>
   </section>
   <aside className="geo-claim-list"><div className="geo-panel-head"><div><strong><SearchCheck size={18}/> Boundary claims</strong><small>Review status is not legal title status</small></div></div><label className="geo-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter asset, district or status" aria-label="Search boundaries"/></label><div className="geo-claims">{filtered.length?filtered.map(p=><button className={'geo-claim '+(p.id===chosen?.id?'active':'')} key={p.id} onClick={()=>setSelected(p.id)}><span className="geo-claim-top"><b>{p.asset_code||p.id.slice(0,8)}</b><em className={'geo-status '+p.status.toLowerCase()}>{prettyStatus(p.status)}</em></span><small><MapPin size={13}/>{p.district||'Location not supplied'} · {p.source_kind.replaceAll('_',' ').toLowerCase()}</small><span>{Math.round(p.area_sqm).toLocaleString()} m² · recorded</span></button>):<p className="geo-empty">No visible claims in this map viewport.</p>}</div></aside>
  </div>
  <div className="geo-lower">
   <section className="geo-info"><div className="geo-panel-head"><div><strong><Layers3 size={19}/> Selected parcel evidence</strong><small>{chosen?.id||'Select an outline'}</small></div></div>{chosen?<><div className="geo-pair"><span>Asset</span><b>{chosen.asset_code||'Private asset'}</b></div><div className="geo-pair"><span>Evidence source</span><b>{chosen.source_kind.replaceAll('_',' ')}</b></div><div className="geo-pair"><span>Submitted reference</span><b>{chosen.source_reference||'Not supplied'}</b></div><div className="geo-pair"><span>Computed surface area</span><b>{Number(chosen.area_sqm).toLocaleString()} m²</b></div><div className="geo-pair"><span>Review state</span><b>{prettyStatus(chosen.status)}</b></div><div className="geo-warning"><AlertTriangle size={18}/> Area comes from the submitted geometry and is not a certified survey measurement. Legal tenure, title and disputes require independent checks.</div><div className="geo-overlaps" aria-label="Preliminary geometry comparison"><div className="geo-overlap-head"><SearchCheck size={17}/><strong>Potential boundary overlaps</strong><span>v0.10</span></div><p>Geometric comparison of <b>accessible</b>, peer-reviewed private outlines only. Not a government boundary or legal dispute decision.</p>{DEMO?<p className="geo-overlap-empty">Design preview only — comparison results require a connected PostGIS API.</p>:overlapLoading?<p className="geo-overlap-empty">Comparing accessible boundaries…</p>:overlapError?<p role="alert" className="geo-overlap-empty">Comparison unavailable: {overlapError}</p>:overlaps.length?<div className="geo-overlap-results">{overlaps.map(item=><div className={'geo-overlap-result '+item.severity.toLowerCase()} key={item.claimId}><span><b>{item.assetCode}</b><small>{item.sharedAreaSqm.toLocaleString()} m² shared · {item.percentageOfSmaller}% of smaller outline</small></span><em>{item.severity.replaceAll('_',' ')}</em></div>)}</div>:<p className="geo-overlap-empty">No intersecting accessible, accepted outlines found. This does <b>not</b> mean the land is free of disputes or encumbrances.</p>}</div>{chosen.status==='DRAFT'&&<button className="geo-cta" disabled={busy} onClick={submit}><Send size={17}/> Submit for surveyor review</button>}{chosen.status==='SUBMITTED'&&<div className="geo-review"><h4>Accredited surveyor review</h4><p>Requires a separate accredited surveyor and recent MFA confirmation.</p><select value={reviewDecision} onChange={e=>setReviewDecision(e.target.value)}><option value="ACCEPTED">Accept evidence</option><option value="REJECTED">Reject evidence</option></select><textarea value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} placeholder="Record an attributable review finding"/><button onClick={review} disabled={busy||reviewNotes.trim().length===0} className="geo-cta"><CheckCircle2 size={17}/> Record review decision</button></div>}</>:<p>No parcel selected.</p>}</section>
   <section className="geo-form"><div className="geo-panel-head"><div><strong><Plus size={19}/> Create boundary draft</strong><small>Coordinates must be ordered longitude, latitude</small></div></div><label>Land asset<select value={assetId} onChange={e=>setAssetId(e.target.value)}>{assets.filter(a=>a.asset_type==='LAND').map(a=><option key={a.id} value={a.id}>{a.asset_code} · {a.district}</option>)}</select></label><label>Source type<select value={sourceKind} onChange={e=>setSourceKind(e.target.value)}><option value="CLIENT_SKETCH">Client sketch</option><option value="FIELD_SURVEY">Field survey</option><option value="DOCUMENT_TRANSCRIPTION">Document transcription</option></select></label><label>Evidence reference<input value={sourceRef} onChange={e=>setSourceRef(e.target.value)} placeholder="Private survey or document reference"/></label><label>Polygon vertices (one longitude,latitude per line)<textarea spellCheck={false} className="geo-coordinates" value={coords} onChange={e=>setCoords(e.target.value)}/></label><div className="geo-hint"><FileText size={16}/> 3–100 vertices · no self-intersections · WGS84 · ring closes automatically</div><button className="geo-cta" onClick={create} disabled={busy||!assetId}><Plus size={18}/> Save boundary draft</button></section>
  </div>
  {message&&<div className="geo-feedback" role="status">{message}</div>}
  <div className="geo-footer"><Scale size={17}/><span>{localTilesEnabled?'Locally hosted tiles show geographic context only. Private overlays are not certified cadastral boundaries or ownership proof.': 'To enable real local maps, provision licensed raster MBTiles, run the tile service and set VITE_SELF_HOSTED_MAP_ENABLED=true. The current coordinate grid is not a basemap.'}</span></div>
 </div>
}
