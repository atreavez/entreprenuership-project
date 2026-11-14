/** Server-only outbound HTTPS adapter; do not call from the browser or put credentials in VITE_* variables. */
import { checkResetDelivery, ResetDeliveryEnvironment } from '../domain/password-reset-policy';

export async function sendPasswordResetNotice(
 env:ResetDeliveryEnvironment,to:string,token:string,
 fetcher:typeof fetch = fetch
):Promise<void>{
 const cfg=checkResetDelivery(env);
 if(!cfg.ok||!cfg.relayUrl||!cfg.publicOrigin)throw new Error('PASSWORD_RESET_DELIVERY_NOT_CONFIGURED');
 const url=`${cfg.publicOrigin}/#reset-password/${encodeURIComponent(token)}`;
 const response=await fetcher(cfg.relayUrl,{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
  headers:{'Content-Type':'application/json','Authorization':`Bearer ${env.PASSWORD_RESET_RELAY_TOKEN}`},
  body:JSON.stringify({to,subject:'AssetTrust password reset',text:`A password reset was requested for your AssetTrust account. If it was you, use this link within 15 minutes:\n${url}\nIf not, ignore this message. No password has been changed.`})
 });
 if(!response.ok)throw new Error('PASSWORD_RESET_DELIVERY_FAILED');
}
