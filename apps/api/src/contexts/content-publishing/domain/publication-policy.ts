/** Pure publication policy: only published (not pending) administrator templates enter live outputs. */
import {definitionFor,renderPlainText,NON_OFFICIAL_NOTICE,type TemplateScope} from '../../content-admin/domain/template-policy';
export type PublishedRow={body:string;revision:number}|null;
export type PublishedText={key:string;text:string;revision:number;source:'APPROVED'|'DEFAULT'};
const PUBLIC_KEYS=['website.hero_title','website.support_notice'] as const;
export function assertPublicCopyKey(value:unknown):typeof PUBLIC_KEYS[number]{
 if(typeof value!=='string'||!PUBLIC_KEYS.includes(value as any))throw Error('Public content key not found');
 return value as typeof PUBLIC_KEYS[number];
}
export function publishText(scope:TemplateScope,key:string,published:PublishedRow,context:Record<string,unknown>):PublishedText{
 const def=definitionFor(scope,key);
 if(!context||typeof context!=='object'||Array.isArray(context)||Object.keys(context).some(k=>!def.allowedTokens.includes(k)))throw Error('Unexpected publication variable');
 if(published && (!Number.isSafeInteger(published.revision)||published.revision<1))throw Error('Invalid published revision');
 const text=renderPlainText(published?published.body:def.defaultBody,context,def);
 return {key,text,revision:published?.revision??0,source:published?'APPROVED':'DEFAULT'};
}
/** A read-time draft snapshot, not a certified record or an issued report. */
export function attachDraftPublication<T extends {reportType:string}>(report:T,publication:PublishedText):T&{publication:{status:'DRAFT';templateKey:string;templateRevision:number;templateSource:string;summary:string;legalNotice:string}}{
 if(report.reportType!=='NON_OFFICIAL_DUE_DILIGENCE_EVIDENCE_SUMMARY'||publication.key!=='report.summary')throw Error('Cannot attach publication to an unregistered report type');
 return {...report,publication:{status:'DRAFT',templateKey:publication.key,templateRevision:publication.revision,templateSource:publication.source,summary:publication.text,legalNotice:NON_OFFICIAL_NOTICE}};
}
