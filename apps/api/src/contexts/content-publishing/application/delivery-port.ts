/** Replaceable future external-delivery port. Never claim a message was sent without provider confirmation. */
export type ExternalChannel='EMAIL'|'SMS';
export type ExternalDeliveryRequest={organizationId:string;recipientId:string;channel:ExternalChannel;subject:string;body:string};
export type ExternalDeliveryResult=
 | {sent:true;status:'SENT';channel:ExternalChannel;providerMessageId:string}
 | {sent:false;status:'NOT_CONFIGURED'|'FAILED';channel:ExternalChannel;reason?:string};
export interface ExternalNotificationPort {send(request:ExternalDeliveryRequest):Promise<ExternalDeliveryResult>}
/** Default is deliberately disabled. In-app notifications use the existing database instead. */
export class DisabledExternalNotificationAdapter implements ExternalNotificationPort {
 async send(request:ExternalDeliveryRequest):Promise<ExternalDeliveryResult>{
  if(request.channel!=='EMAIL'&&request.channel!=='SMS')throw Error('Unsupported external channel');
  return {sent:false,status:'NOT_CONFIGURED',channel:request.channel};
 }
}
