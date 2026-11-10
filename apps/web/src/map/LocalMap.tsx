import React,{useEffect,useRef,useState} from 'react';
import {assertLocalBasemapStyle,claimFeatures,localStylePath} from './domain/map-policy';

type Props={claims:any[];selectedId:string;stylePath:string;onSelect:(id:string)=>void;onUnavailable:()=>void;onViewportChange:(bounds:[number,number,number,number])=>void;viewport:[number,number,number,number]};
/** Infrastructure adapter for MapLibre. The only network basemap source is /maps.
 * Sensitive overlays are from the authenticated parent page, never from public tile requests.
 */
export default function LocalMap({claims,selectedId,stylePath,onSelect,onUnavailable,onViewportChange,viewport}:Props){
 const holder=useRef<HTMLDivElement>(null);
 const mapRef=useRef<any>(null);
 const selectRef=useRef(onSelect);const boundsRef=useRef(onViewportChange);const claimsRef=useRef(claims);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');const [problem,setProblem]=useState('');
 selectRef.current=onSelect;boundsRef.current=onViewportChange;claimsRef.current=claims;
 useEffect(()=>{
  let live=true;let map:any;
  (async()=>{
   const safePath=localStylePath(stylePath);
   const response=await fetch(safePath,{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('Local basemap is unavailable. Start the licensed tile service and check the /maps proxy.');
   const style=await response.json();assertLocalBasemapStyle(style);
   const libre=await import('maplibre-gl');
   if(!live||!holder.current)return;
   const center:[number,number]=[(viewport[0]+viewport[2])/2,(viewport[1]+viewport[3])/2];
   map=new libre.Map({container:holder.current,style,center,zoom:10,attributionControl:true,collectResourceTiming:false,fadeDuration:0});
   mapRef.current=map;
   map.addControl(new libre.NavigationControl({showCompass:true}),'top-left');
   map.on('load',()=>{
    if(!live)return;
    map.addSource('assettrust-parcels',{type:'geojson',data:claimFeatures(claimsRef.current)});
    map.addLayer({id:'assettrust-parcel-fill',type:'fill',source:'assettrust-parcels',paint:{'fill-color':'#20a86a','fill-opacity':0.19}});
    map.addLayer({id:'assettrust-parcel-outline',type:'line',source:'assettrust-parcels',paint:{'line-width':['case',['==',['get','claimId'],selectedId],4,2],'line-color':['case',['==',['get','claimId'],selectedId],'#f4ce6d','#34d88a']}});
    map.on('click','assettrust-parcel-fill',(e:any)=>{const id=e.features?.[0]?.properties?.claimId;if(typeof id==='string')selectRef.current(id)});
    map.on('moveend',()=>{const b=map.getBounds();const bounds:[number,number,number,number]=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];if(bounds.every(Number.isFinite) && bounds[2]-bounds[0]>0 && bounds[2]-bounds[0]<=2 && bounds[3]-bounds[1]>0 && bounds[3]-bounds[1]<=2)boundsRef.current(bounds)});
    map.on('mouseenter','assettrust-parcel-fill',()=>map.getCanvas().style.cursor='pointer');
    map.on('mouseleave','assettrust-parcel-fill',()=>map.getCanvas().style.cursor='');
    map.fitBounds([[viewport[0],viewport[1]],[viewport[2],viewport[3]]],{padding:36,duration:0,maxZoom:14});
    setStatus('ready');
   });
   map.on('error',(event:any)=>{if(!live)return;setProblem('A local map tile or style failed to load. Check the MBTiles dataset coverage.');console.warn('AssetTrust local map error',event.error?.message||event)});
  })().catch(e=>{if(live){setStatus('error');setProblem(String(e.message||e));onUnavailable();}});
  return()=>{live=false;mapRef.current=null;map?.remove()};
 },[stylePath]);
 useEffect(()=>{const m=mapRef.current;const source=m?.getSource('assettrust-parcels');if(source?.setData)source.setData(claimFeatures(claims));},[claims]);
 useEffect(()=>{const m=mapRef.current;if(m?.getLayer('assettrust-parcel-outline'))m.setPaintProperty('assettrust-parcel-outline','line-color',['case',['==',['get','claimId'],selectedId],'#f4ce6d','#34d88a']);},[selectedId]);
 useEffect(()=>{const m=mapRef.current;if(m?.loaded())m.fitBounds([[viewport[0],viewport[1]],[viewport[2],viewport[3]]],{padding:36,duration:280,maxZoom:14});},[viewport]);
 return <div className="assettrust-local-map"><div className="assettrust-local-map-canvas" ref={holder} aria-label="Interactive, self-hosted basemap with private parcel evidence overlays" role="region"/>{status!=='ready'&&<div className="assettrust-map-notice" role="status">{status==='loading'?'Connecting to AssetTrust local map tiles…':problem}</div>}{problem&&status==='ready'&&<div className="assettrust-map-notice map-warning" role="status">{problem}</div>}<div className="assettrust-map-trust">Private evidence overlay · Not an official cadastral map</div></div>
}
