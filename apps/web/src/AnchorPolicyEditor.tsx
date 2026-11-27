import React from 'react';
type Policy={enabled:boolean;target:{providerId:string;networkId:string;minConfirmations:number};retryBaseMs:number;maxAttempts:number;pollMs:number};
const defaults:Policy={enabled:false,target:{providerId:'NONE',networkId:'NONE',minConfirmations:6},retryBaseMs:30000,maxAttempts:5,pollMs:60000};
export default function AnchorPolicyEditor({value,onChange}:{value:string;onChange:(v:string)=>void}){
 let p:Policy=defaults;
 try{if(value){const x=JSON.parse(value);if(!x||!x.target||typeof x.enabled!=='boolean')throw Error();p=x;}}catch{return <><textarea aria-label="Invalid policy JSON" value={value} onChange={e=>onChange(e.target.value)}/><button type="button" className="button secondary" onClick={()=>onChange(JSON.stringify(defaults))}>Reset draft</button></>}
 const change=(next:Partial<Policy>)=>onChange(JSON.stringify({...p,...next}));
 return <div role="group" aria-label="Anchoring policy" style={{display:'grid',gap:8}}>
  <label><input type="checkbox" checked={p.enabled} onChange={e=>change({enabled:e.target.checked})}/> Allow anchoring requests (not external dispatch)</label>
  <label>Registered adapter ID<input aria-label="Registered adapter ID" value={p.target.providerId} onChange={e=>change({target:{...p.target,providerId:e.target.value}})}/></label>
  <label>Network ID<input value={p.target.networkId} onChange={e=>change({target:{...p.target,networkId:e.target.value}})}/></label>
  <label>Minimum confirmations<input type="number" min={1} max={10000} value={p.target.minConfirmations} onChange={e=>change({target:{...p.target,minConfirmations:Number(e.target.value)}})}/></label>
  <label>Initial retry delay (ms)<input type="number" min={1000} max={3600000} value={p.retryBaseMs} onChange={e=>change({retryBaseMs:Number(e.target.value)})}/></label>
  <label>Maximum attempts<input type="number" min={1} max={20} value={p.maxAttempts} onChange={e=>change({maxAttempts:Number(e.target.value)})}/></label>
  <label>Confirmation polling (ms)<input type="number" min={1000} max={86400000} value={p.pollMs} onChange={e=>change({pollMs:Number(e.target.value)})}/></label>
  {!value&&<button type="button" className="button secondary" onClick={()=>onChange(JSON.stringify(defaults))}>Initialize disabled policy draft</button>}
  <small>Only server-registered adapter identifiers. Never enter keys, credentials or endpoints. Independent approval is required.</small>
 </div>;
}
