/** Origin policy for browser state-changing requests and refresh-cookie CSRF defense.
 * Framework-independent; authorization must still be enforced by the caller.
 */
export type OriginHeaders={origin?:unknown;fetchSite?:unknown};
export function isAllowedRequestOrigin(headers:OriginHeaders, allowedOrigins:readonly string[], requireOrigin=false):boolean {
  const origin=headers.origin;
  const site=headers.fetchSite;
  if(typeof site==='string' && (site==='cross-site'||site==='same-site'))return false;
  if(typeof site==='string' && site!=='' && !['same-origin','none'].includes(site))return false;
  if(origin===undefined || origin===null || origin==='')return !requireOrigin;
  if(typeof origin!=='string' || origin==='null' || origin.includes(',') || origin.includes(' '))return false;
  try{
    const parsed=new URL(origin);
    if(parsed.origin!==origin || parsed.username || parsed.password || parsed.pathname!=='/' || parsed.search || parsed.hash)return false;
    return allowedOrigins.includes(origin);
  }catch{return false;}
}
