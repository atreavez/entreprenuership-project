import {subscriptionActive,type Subscription} from '../domain/commercial-policy';
/** Capability-to-service mapping must be supplied by an approved versioned
 * policy. A valid recorded term is not authorization for a resource itself.
 * Call only after tenant/resource authorization. Default deny unmapped codes.
 * No feature is connected to this policy until an explicit reviewed mapping.
 */
export type EntitlementMapping=Readonly<{capability:string;serviceCodes:readonly string[]}>;
export function hasPaidEntitlement(organizationId:string,capability:string,now:number,terms:readonly Subscription[],mappings:readonly EntitlementMapping[]):boolean{
 if(typeof organizationId!=='string'||!organizationId||typeof capability!=='string'||!capability||!Number.isSafeInteger(now)||now<0)return false;
 const matches=mappings.filter(m=>m.capability===capability);
 if(matches.length!==1||!matches[0].serviceCodes.length)return false;
 return terms.some(t=>t.organizationId===organizationId&&matches[0].serviceCodes.includes(t.code)&&subscriptionActive(t,now));
}
