/** AssetTrust configuration domain: deterministic allowlist. This must not import controllers or SQL. */
export type ConfigScope='platform'|'organization';
export type Definition={key:string;scope:ConfigScope;title:string;category:string;description:string;type:'text'|'email'|'currency'|'integer';max?:number;min?:number;maxNumber?:number;requiresApproval:boolean;effect:'display'|'metadata'};
const DEFINITIONS:readonly Definition[]=[
 {scope:'platform',key:'branding.product_name',title:'Product name',category:'Branding',description:'Displayed in the administration workspace; public branding rollout is separate.',type:'text',max:80,requiresApproval:false,effect:'display'},
 {scope:'platform',key:'branding.support_email',title:'Platform support email',category:'Support',description:'The published support contact in administration.',type:'email',requiresApproval:false,effect:'display'},
 {scope:'platform',key:'branding.public_notice',title:'Platform information banner',category:'Content',description:'Operational notice; cannot override legal disclaimers.',type:'text',max:300,requiresApproval:false,effect:'display'},
 {scope:'platform',key:'billing.default_currency',title:'Default pricing currency',category:'Finance',description:'Catalog metadata only. No payment collection or invoice calculations are activated.',type:'currency',requiresApproval:true,effect:'metadata'},
 {scope:'platform',key:'platform.home_country',title:'Primary operating country',category:'Geography',description:'Region metadata; does not connect to government registries.',type:'text',max:80,requiresApproval:true,effect:'metadata'},
 {scope:'organization',key:'workspace.display_name',title:'Workspace display name',category:'Workspace',description:'Displayed to your organization administrators.',type:'text',max:120,requiresApproval:false,effect:'display'},
 {scope:'organization',key:'workspace.support_email',title:'Workspace contact email',category:'Workspace',description:'Administrative contact shown inside your workspace.',type:'email',requiresApproval:false,effect:'display'},
 {scope:'organization',key:'workspace.announcement',title:'Workspace announcement',category:'Content',description:'Non-legal message for administrators; does not change verification evidence.',type:'text',max:400,requiresApproval:false,effect:'display'},
 {scope:'organization',key:'reports.footer_note',title:'Evidence report footer note',category:'Reports',description:'Stored for a future report-template adapter; immutable legal disclaimers remain mandatory.',type:'text',max:240,requiresApproval:false,effect:'metadata'},
 {scope:'organization',key:'workflow.review_target_days',title:'Legacy review target (metadata)',category:'Workflow',description:'Legacy advisory metadata only; not enforced. Use Workflow Designer for versioned stage policies.',type:'integer',min:1,maxNumber:365,requiresApproval:true,effect:'metadata'},
 {scope:'organization',key:'notifications.sender_label',title:'Notification sender label',category:'Notifications',description:'Metadata for a future notification-provider adapter; no messages are sent.',type:'text',max:60,requiresApproval:false,effect:'metadata'}
];
export function assertScope(input:unknown):ConfigScope{if(input!=='platform'&&input!=='organization')throw Error('Invalid configuration scope');return input;}
export function catalog(input:unknown):Definition[]{const scope=assertScope(input);return DEFINITIONS.filter(x=>x.scope===scope).map(x=>({...x}));}
export function assertExpectedVersion(v:unknown):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw Error('Invalid expected version');return v;}
export function assertDecision(v:unknown):'APPROVE'|'REJECT'{if(v!=='APPROVE'&&v!=='REJECT')throw Error('Invalid review decision');return v;}
export function prepareChange(scopeInput:unknown,key:unknown,input:unknown):{definition:Definition;value:string|number;requiresApproval:boolean}{
 const scope=assertScope(scopeInput);
 const def=DEFINITIONS.find(x=>x.scope===scope&&x.key===key);
 if(!def)throw Error('Unsupported configuration key');
 let value:string|number;
 if(def.type==='integer'){
  if(typeof input!=='number'||!Number.isSafeInteger(input)||input<(def.min??1)||input>(def.maxNumber??365))throw Error('Invalid integer configuration value');
  value=input;
 }else{
  if(typeof input!=='string')throw Error('Invalid configuration type');
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input))throw Error('Invalid control characters');
  if(def.type==='currency'){
   if(!/^[A-Za-z]{3}$/.test(input))throw Error('Invalid ISO currency code');value=input.toUpperCase();
  }else if(def.type==='email'){
   value=input.trim().toLowerCase();
   if(value.length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('Invalid email address');
  }else{
   value=input.trim();
   if(!value||value.length>(def.max||120))throw Error('Invalid text length');
  }
 }
 return {definition:{...def},value,requiresApproval:def.requiresApproval};
}
/** Pending and rejected proposals are never treated as current applied settings. */
export function effectiveValue(record:{status:string;value:unknown}|null):unknown{return record?.status==='ACTIVE'?record.value:'';}
