/** Pure bounded-domain template policy. Only registered plain-text templates may be edited. */
export type TemplateScope='organization'|'platform';
export type TemplateDefinition={key:string;scope:TemplateScope;title:string;category:string;description:string;allowedTokens:readonly string[];defaultBody:string;maxLength:number;requiresApproval:boolean};
export const NON_OFFICIAL_NOTICE='AssetTrust records are private verification evidence, not a government-issued title or proof of legal ownership. Verify official ownership with authorized government offices.';
const templates:readonly TemplateDefinition[]=[
 {scope:'platform',key:'website.hero_title',title:'Public landing headline',category:'Website',description:'Published headline displayed on public sign-in landing; only approved global copy is served.',allowedTokens:[],defaultBody:'Verify assets with documented evidence',maxLength:100,requiresApproval:true},
 {scope:'platform',key:'website.support_notice',title:'Public support notice',category:'Website',description:'Published public landing help text; cannot alter ownership disclaimers.',allowedTokens:[],defaultBody:'For assistance, contact your AssetTrust administrator.',maxLength:500,requiresApproval:true},
 {scope:'organization',key:'branding.workspace_tagline',title:'Workspace tagline',category:'Branding',description:'Short non-legal workspace description; preview available.',allowedTokens:['organization_name'],defaultBody:'Evidence-led verification for {{organization_name}}',maxLength:160,requiresApproval:false},
 {scope:'organization',key:'report.summary',title:'Evidence report summary',category:'Reports',description:'Approved organization wording appears on non-official report drafts; legal notice is fixed.',allowedTokens:['asset_reference','case_reference','organization_name'],defaultBody:'Verification case {{case_reference}} for asset {{asset_reference}} was reviewed by {{organization_name}}. Refer to individual evidence findings.',maxLength:1200,requiresApproval:true},
 {scope:'organization',key:'document.upload_guidance',title:'Secure document upload guidance',category:'Documents',description:'Instructions shown in the template preview. This does not change required evidence or document retention rules.',allowedTokens:['organization_name'],defaultBody:'Upload clear, authentic supporting records for {{organization_name}}. Originals may be required by an accredited reviewer.',maxLength:650,requiresApproval:true},
 {scope:'organization',key:'report.reviewer_note',title:'Reviewer information note',category:'Reports',description:'Optional contextual report text, not a legal finding.',allowedTokens:['organization_name','case_reference'],defaultBody:'Prepared by {{organization_name}} for case {{case_reference}}.',maxLength:700,requiresApproval:true},
 {scope:'organization',key:'notification.case_assigned',title:'Case assignment message',category:'Notifications',description:'Approved body for in-app case assignment notification; external providers are not connected.',allowedTokens:['case_reference','recipient_name','organization_name'],defaultBody:'Hello {{recipient_name}}, case {{case_reference}} has been assigned to you by {{organization_name}}.',maxLength:500,requiresApproval:true},
 {scope:'organization',key:'notification.case_updated',title:'Case update message',category:'Notifications',description:'Approved message draft; automatic event binding and external email/SMS sending are not yet enabled.',allowedTokens:['case_reference','recipient_name','organization_name'],defaultBody:'Hello {{recipient_name}}, case {{case_reference}} has an update in {{organization_name}}.',maxLength:500,requiresApproval:true}
];
export function assertScope(input:unknown):TemplateScope{if(input!=='organization'&&input!=='platform')throw Error('Invalid template scope');return input;}
export function catalog(scopeInput:unknown):TemplateDefinition[]{const scope=assertScope(scopeInput);return templates.filter(t=>t.scope===scope).map(t=>({...t,allowedTokens:[...t.allowedTokens]}));}
export function definitionFor(scopeInput:unknown,key:unknown):TemplateDefinition{const scope=assertScope(scopeInput);const d=templates.find(t=>t.scope===scope&&t.key===key);if(!d)throw Error('Template key is not in the approved catalogue');return {...d,allowedTokens:[...d.allowedTokens]};}
export function prepareTemplate(scopeInput:unknown,key:unknown,input:unknown):{definition:TemplateDefinition;body:string;requiresApproval:boolean}{
 const definition=definitionFor(scopeInput,key);
 if(typeof input!=='string')throw Error('Template must be plain text');
 const body=input.trim();
 if(body.length<5||body.length>definition.maxLength)throw Error('Template text exceeds permitted length');
 if(/[<>]|[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(body))throw Error('HTML, XML, and control characters are prohibited');
 // Unmatched curly braces and arbitrary variable expansion are rejected rather than interpolated.
 const withoutTokens=body.replace(/\{\{([a-z_]+)\}\}/g,(_all:string,token:string)=>{
  if(!definition.allowedTokens.includes(token))throw Error('Unsupported template variable: '+token);
  return '';
 });
 if(/[{}]/.test(withoutTokens))throw Error('Invalid template token syntax');
 return {definition,body,requiresApproval:definition.requiresApproval};
}
export function assertRevision(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw Error('Invalid expected revision');return value;}
export function assertReason(value:unknown):string{if(typeof value!=='string'||value.trim().length<12||value.length>500)throw Error('Change reason must contain 12–500 characters');return value.trim();}
export function assertDecision(value:unknown):'APPROVE'|'REJECT'{if(value!=='APPROVE'&&value!=='REJECT')throw Error('Invalid approval decision');return value;}
export function renderPlainText(body:string,context:Record<string,unknown>,definition:TemplateDefinition):string{
 const validated=prepareTemplate(definition.scope,definition.key,body);
 return validated.body.replace(/\{\{([a-z_]+)\}\}/g,(_match:string,variable:string)=>{
  if(!definition.allowedTokens.includes(variable))throw Error('Forbidden preview variable');
  const raw=context[variable]; if(typeof raw!=='string'||raw.length>160||/[<>\x00-\x1f\x7f]/.test(raw))throw Error('Unsafe or missing preview data');
  return raw;
 });
}
export function renderReportPreview(body:string,context:Record<string,unknown>):{body:string;notice:string}{
 return {body:renderPlainText(body,context,definitionFor('organization','report.summary')),notice:NON_OFFICIAL_NOTICE};
}
