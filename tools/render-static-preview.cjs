// Offline source-based preview for documentation only. This is a tiny JSX renderer,
// NOT the actual React runtime. For production interactions use npm install and Vite.
// Renders the actual App.tsx component tree with demo fixtures and shared CSS.
const ts=(()=>{try{return require('typescript')}catch{return require(require('node:path').join(require('node:child_process').execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'))}})();
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const authMode=process.argv.includes('--auth');
const adminGlobalMode=process.argv.includes('--admin-global');
const reviewerMode=process.argv.includes('--review-desk');
const providerOnly=process.argv.includes('--providers-only');
const issuanceOnly=process.argv.includes('--issuance-only');
const publicVerificationOnly=process.argv.includes('--verify-only');
const pages=publicVerificationOnly?['verify/report/fa3466d1-6fd2-464d-a489-892fc8acd169']:issuanceOnly?['issuance']:providerOnly?['providers']:authMode?['auth']:reviewerMode?['professional']:adminGlobalMode?['admin']:['dashboard','geo','assets','asset-detail/demo-1','cases','case-detail/case1','documents','reports','billing','audit','notifications','assignments','team','tasks','disputes','monitoring','quotes','access','integrations','readiness','settings','security','professional','admin','members','workflows','content','providers','issuance'];
const root=path.resolve(__dirname,'..'),src=path.join(root,'apps/web/src'),output=path.join(root,'screenshots');fs.mkdirSync(output,{recursive:true});
let currentFrame=null, dirty=false, effects=[];
const hooks=new Map();
const FRAG=Symbol('fragment');
const REACT={createElement(type,props,...kids){return {type,props:{...props,children:kids.length>1?kids:kids[0]}}}, Fragment:FRAG,
 useState(init){const f=currentFrame,slot=f.idx++, arr=hooks.get(f.path)||[];if(!(slot in arr))arr[slot]=typeof init==='function'?init():init;hooks.set(f.path,arr);return [arr[slot],value=>{const next=typeof value==='function'?value(arr[slot]):value;if(arr[slot]!==next){arr[slot]=next;dirty=true}}]},
 useEffect(fn,deps){const f=currentFrame,slot=f.idx++,arr=hooks.get(f.path)||[];const prev=arr[slot];if(!prev ||!deps||deps.some((d,i)=>d!==prev[i])){arr[slot]=deps||[];effects.push(fn)}hooks.set(f.path,arr)},
 useCallback(fn,deps){return fn;},useMemo(fn,deps){return fn()}
};
const FakeIcon=(name)=>function icon(props={}){return REACT.createElement('svg',{width:props.size||24,height:props.size||24,...props,xmlns:'http://www.w3.org/2000/svg',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.65,strokeLinecap:'round',strokeLinejoin:'round'},
 REACT.createElement('rect',{x:4,y:4,width:16,height:16,rx:4}),REACT.createElement('path',{d:'m8 12 3 3 5-6'}));};
const ICONS=new Proxy({__esModule:true},{get(_,prop){if(prop==='__esModule')return true;if(prop===Symbol.toStringTag)return 'Module';return FakeIcon(prop)}});
const REACT_MODULE={__esModule:true,default:REACT,...REACT};
const moduleCache=new Map();const contextGlobals={console,Buffer,process,URL,Intl,Date,Math,Number,String,Boolean,Array,Object,Set,Map,Promise,Error,JSON,RegExp,
 window:{__ASSETTRUST_PREVIEW_DESK__:reviewerMode,__ASSETTRUST_PREVIEW_ADMIN_PLATFORM__:adminGlobalMode,location:{hash:'#dashboard'},addEventListener(){},removeEventListener(){},scrollTo(){}},
 sessionStorage:{getItem(){return ''},setItem(){},removeItem(){}},document:{},fetch(){throw Error('fetch not expected in demo')},
};
function localRequire(from,spec){if(spec==='react')return REACT_MODULE;if(spec==='lucide-react')return ICONS;if(spec==='qrcode.react')return {__esModule:true,QRCodeSVG:(props)=>REACT.createElement('div',{className:'qr-source-preview',role:'img','aria-label':'QR rendered by qrcode.react in the real browser'},'QR LINK PREVIEW')};if(spec.startsWith('.'))return load(path.resolve(path.dirname(from),spec.endsWith('.tsx')||spec.endsWith('.ts')?spec: spec+(fs.existsSync(path.resolve(path.dirname(from),spec+'.tsx'))?'.tsx':'.ts')));throw Error('unknown '+spec)}
function load(file){if(moduleCache.has(file))return moduleCache.get(file).exports;let raw=fs.readFileSync(file,'utf8');raw=raw.replace(/import\.meta\.env\.VITE_DESIGN_PREVIEW/g,authMode?"'false'":"'true'").replace(/import\.meta\.env\.VITE_SELF_HOSTED_MAP_ENABLED/g,"'false'").replace(/import\.meta\.env\.VITE_LOCAL_MAP_STYLE_PATH/g,"'/maps/style.json'");const code=ts.transpileModule(raw,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;const module={exports:{}};moduleCache.set(file,module);const sandbox={...contextGlobals,exports:module.exports,module,require:spec=>localRequire(file,spec)};vm.runInNewContext(code,sandbox,{filename:file});return module.exports}
function escape(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
function kebab(s){return s.replace(/[A-Z]/g,x=>'-'+x.toLowerCase())}
function render(element,path='root'){
 if(element===null||element===undefined||typeof element==='boolean')return '';
 if(Array.isArray(element))return element.map((x,i)=>render(x,path+'/'+i)).join('');
 if(typeof element==='string'||typeof element==='number')return escape(element);
 const {type,props={}}=element;
 if(type===FRAG)return render(props.children,path+'/frag');
 if(typeof type==='function'){
  let before=currentFrame;currentFrame={path,idx:0};let result;
  try{result=type(props)}catch(e){console.error('render component',type.name,e);throw e}finally{currentFrame=before}
  return render(result,path+'/r');
 }
 if(typeof type!=='string')return '';
 let attrs='';for(const [k,v] of Object.entries(props)){
  if(k==='children'||k==='key'||k==='ref'||k.startsWith('on')||v===undefined||v===null||v===false)continue;
  let name=k==='className'?'class':k==='htmlFor'?'for':k==='strokeWidth'?'stroke-width':k==='strokeLinecap'?'stroke-linecap':k==='strokeLinejoin'?'stroke-linejoin':k==='viewBox'?'viewBox':k;
  if(k==='style'&&typeof v==='object'){const style=Object.entries(v).map(([a,b])=>`${kebab(a)}:${b}`).join(';');attrs+=` style="${escape(style)}"`;continue}
  attrs+=` ${name}="${v===true?'':escape(v)}"`;
 }
 if(['input','img','br','hr','meta','link'].includes(type))return `<${type}${attrs}/>`;
 if(type==='textarea')return `<textarea${attrs}>${escape(props.value??props.defaultValue??props.children??'')}</textarea>`;
 if(type==='select'){let options=render(props.children,path+'/children');if(props.value!==undefined){options=options.replace(/<option([^>]*?)value="([^"]*)"([^>]*)>/g,(match,b,value,a)=>value===String(props.value)?`<option${b}value="${value}"${a} selected>`:match);}return `<select${attrs}>${options}</select>`;}
 return `<${type}${attrs}>${render(props.children,path+'/children')}</${type}>`;
}
const App=load(path.join(src,'App.tsx')).default;
(async()=>{for(const page of pages){contextGlobals.window.location.hash='#'+page;hooks.clear();let html='';for(let i=0;i<7;i++){dirty=false;effects=[];html=render(REACT.createElement(App,{}));const fns=effects;effects=[];for(const fn of fns){try{fn()}catch(e){console.warn('effect',e.message)}}await new Promise(r=>setTimeout(r,0));if(!dirty&&!effects.length)break;}
 const css=fs.readFileSync(path.join(src,'styles.css'),'utf8');const title=(reviewerMode?'professional-review-desk':adminGlobalMode?'admin-platform':page.replaceAll('/','_'));const outputHtml=`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AssetTrust ${escape(title)}</title><style>${css}</style></head><body>${html}</body></html>`;
 fs.writeFileSync(path.join(output,title+'.html'),outputHtml);
 console.log('Rendered '+title,html.length,'bytes');}
})().catch(err=>{console.error(err);process.exitCode=1});
