import React from 'react';
type Price={code:string;unitUgx:number;periodDays:number|null};
function parse(value:string):Price[]|null{
 if(!value)return [];
 try{
  const p=JSON.parse(value);
  if(!Array.isArray(p)||p.length>100||p.some(x=>!x||typeof x!=='object'||Object.keys(x).length!==3||typeof x.code!=='string'||typeof x.unitUgx!=='number'||(x.periodDays!==null&&typeof x.periodDays!=='number')))return null;
  return p;
 }catch{return null;}
}
export function validBillingCatalog(value:string):boolean{
 const p=parse(value);return !!p&&p.length>0&&new Set(p.map(x=>x.code)).size===p.length&&p.every(x=>/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(x.code)&&Number.isSafeInteger(x.unitUgx)&&x.unitUgx>=1&&x.unitUgx<=1000000000&&(x.periodDays===null||(Number.isSafeInteger(x.periodDays)&&x.periodDays>=1&&x.periodDays<=366)));
}
export default function BillingCatalogEditor({value,onChange,disabled=false}:{value:string;onChange:(s:string)=>void;disabled?:boolean}){
 const rows=parse(value);
 if(rows===null)return <div className="exp-form"><p>Stored catalog cannot be displayed as structured rows. Review the original value before replacing it.</p><textarea aria-label="Raw price catalog" disabled value={value}/><button type="button" className="button secondary" disabled={disabled} onClick={()=>onChange('[]')}>Replace with empty draft</button></div>;
 const update=(i:number,patch:Partial<Price>)=>onChange(JSON.stringify(rows.map((r,j)=>j===i?{...r,...patch}:r)));
 return <fieldset disabled={disabled} className="billing-catalog-editor"><legend>Catalog items (UGX)</legend>
  {rows.map((r,i)=><div className="exp-form billing-price-row" key={i}>
   <label className="field"><span>Service code</span><input value={r.code} maxLength={128} onChange={e=>update(i,{code:e.target.value})}/></label>
   <label className="field"><span>Unit price (whole UGX)</span><input type="number" min={1} max={1000000000} step={1} value={r.unitUgx} onChange={e=>update(i,{unitUgx:Number(e.target.value)})}/></label>
   <label className="field"><span>Billing term</span><select value={r.periodDays===null?'once':'fixed'} onChange={e=>update(i,{periodDays:e.target.value==='once'?null:30})}><option value="once">One-time</option><option value="fixed">Fixed days</option></select></label>
   {r.periodDays!==null&&<label className="field"><span>Number of days</span><input type="number" min={1} max={366} step={1} value={r.periodDays} onChange={e=>update(i,{periodDays:Number(e.target.value)})}/></label>}
   <button type="button" className="button secondary" onClick={()=>onChange(JSON.stringify(rows.filter((_,j)=>j!==i)))}>Remove item {i+1}</button>
  </div>)}
  <button type="button" className="button secondary" disabled={disabled||rows.length>=100} onClick={()=>onChange(JSON.stringify([...rows,{code:'',unitUgx:1,periodDays:null}]))}>Add service</button>
  <p>Unique codes, positive integer prices, and fixed-day terms of 1–366 days. No price is published until another authorized platform administrator approves it.</p>
  {!validBillingCatalog(value)&&<p role="status">Complete all items with valid unique codes and prices before requesting approval.</p>}
 </fieldset>;
}
