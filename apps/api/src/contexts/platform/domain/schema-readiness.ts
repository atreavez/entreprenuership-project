import {REQUIRED_SCHEMA_MIGRATIONS,REQUIRED_POSTGIS_TABLES} from './schema-manifest';

export type SchemaFinding={ready:boolean;reason?:string};
export type SchemaSnapshot={migrations:Array<{filename:string;sha256:string}>;postgis:boolean;tables:string[]};
/** Pure domain policy. DB probes are handled by an infrastructure adapter. */
export function evaluateSchema(snapshot:SchemaSnapshot):SchemaFinding{
 if(!snapshot.postgis)return {ready:false,reason:'PostGIS extension unavailable'};
 const tables=new Set(snapshot.tables);
 if(REQUIRED_POSTGIS_TABLES.some(t=>!tables.has(t)))return {ready:false,reason:'Required database tables missing'};
 if(snapshot.migrations.length!==REQUIRED_SCHEMA_MIGRATIONS.length)return {ready:false,reason:'Database migrations missing or unexpected'};
 for(const m of REQUIRED_SCHEMA_MIGRATIONS){
  const matching=snapshot.migrations.filter(r=>r.filename===m.filename);
  if(matching.length!==1 || matching[0].sha256!==m.sha256)return {ready:false,reason:'Database schema checksum mismatch'};
 }
 return {ready:true};
}
