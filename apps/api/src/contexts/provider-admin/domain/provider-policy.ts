/** Pure domain rules for administrator-managed external notification-provider *staging*.
 * Deliberately does not send, store secrets, call URLs, or enable external egress.
 */
export type Channel='EMAIL'|'SMS';
export type Provider='NONE'|'SMTP_RELAY'|'HTTPS_RELAY';
export type ProviderStatus='DISABLED'|'STAGED';
export type ProviderConfiguration={channel:Channel;provider:Provider;status:ProviderStatus;senderLabel:string;credentialRef:string|null};
export type DeliveryGate={sent:false;status:'NOT_CONFIGURED';channel:Channel;reason:string};
const keys=['channel','provider','status','senderLabel','credentialRef'];
export function validateProviderConfiguration(input:unknown):ProviderConfiguration{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Provider configuration must be an object');
 const v=input as Record<string,unknown>;
 if(Object.keys(v).some(key=>!keys.includes(key)))throw Error('Unknown provider setting (secrets and arbitrary endpoints are prohibited)');
 if(v.channel!=='EMAIL'&&v.channel!=='SMS')throw Error('Unsupported notification channel');
 if(v.provider!=='NONE'&&v.provider!=='SMTP_RELAY'&&v.provider!=='HTTPS_RELAY')throw Error('Unknown provider adapter');
 if(v.provider==='SMTP_RELAY'&&v.channel!=='EMAIL')throw Error('SMTP relay is only available for email');
 if(v.status!=='DISABLED'&&v.status!=='STAGED')throw Error('External transport can only be disabled or staged');
 if(typeof v.senderLabel!=='string'||v.senderLabel.length<3||v.senderLabel.length>80||/[<>\x00-\x1f\x7f]/.test(v.senderLabel))throw Error('Invalid sender label');
 const senderLabel=v.senderLabel.trim();
 if(senderLabel.length<3)throw Error('Sender label is empty');
 if(v.status==='DISABLED'){
  if(v.provider!=='NONE'||(v.credentialRef!==undefined&&v.credentialRef!==''&&v.credentialRef!==null))throw Error('Disabled configuration must not reference a provider or credentials');
  return {channel:v.channel,provider:'NONE',status:'DISABLED',senderLabel,credentialRef:null};
 }
 if(v.provider==='NONE')throw Error('Staged configuration requires an adapter type');
 if(typeof v.credentialRef!=='string'||!/^vault:\/\/[a-z][a-z0-9-]{1,30}\/[a-z][a-z0-9-]{1,40}$/.test(v.credentialRef))throw Error('Provide a nonsecret credential alias in the format vault://namespace/alias');
 return {channel:v.channel,provider:v.provider,status:'STAGED',senderLabel,credentialRef:v.credentialRef};
}
export function validateVersion(input:unknown):number{
 if(typeof input!=='number'||!Number.isSafeInteger(input)||input<0)throw Error('Invalid expected configuration version');return input;
}
export function validateChangeReason(input:unknown):string{
 if(typeof input!=='string'||input.trim().length<12||input.length>500)throw Error('Reason must contain 12–500 characters');return input.trim();
}
export function validateChangeDecision(input:unknown):'APPROVE'|'REJECT'{if(input!=='APPROVE'&&input!=='REJECT')throw Error('Unsupported provider decision');return input;}
export function providerDeliveryState(input:ProviderConfiguration):'DISABLED'|'NOT_CONNECTED'{
 return input.status==='DISABLED'?'DISABLED':'NOT_CONNECTED';
}
export function evaluateDelivery(input:ProviderConfiguration,transportVerified:boolean):DeliveryGate{
 // Runtime transport is intentionally NOT wired in v0.33. Even a future readiness probe
 // cannot turn staged configuration into a successful delivery acknowledgment.
 void transportVerified;
 return {sent:false,status:'NOT_CONFIGURED',channel:input.channel,reason:input.status==='DISABLED'?'External notifications are disabled':'Provider staged; external transport not deployed or verified'};
}
