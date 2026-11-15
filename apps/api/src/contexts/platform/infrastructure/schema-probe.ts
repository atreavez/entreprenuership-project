import {Injectable,ServiceUnavailableException} from '@nestjs/common';
import {Database} from '../../../database';
import {evaluateSchema,type SchemaSnapshot} from '../domain/schema-readiness';
import {ReadinessCoordinator} from '../domain/readiness-coordinator';

/** Counter fields exist only after both the SQL ledger and live RLS contract pass. */
export type RuntimeSchemaReadiness=
 | {ready:true;verifiedMigrations:number;policiesVerified:number;tablesVerified:number}
 | {ready:false;reason:string};
@Injectable()
export class SchemaProbe{
 constructor(private readonly db:Database){}
 private readonly coordinator=new ReadinessCoordinator<RuntimeSchemaReadiness>();
 /** Concurrent /readyz calls share one fresh inspection; completion never caches success. */
 check():Promise<RuntimeSchemaReadiness>{return this.coordinator.execute(()=>this.inspectFresh());}
 private async inspectFresh():Promise<RuntimeSchemaReadiness>{
  try{
   const extension=await this.db.query("SELECT 1 FROM pg_extension WHERE extname='postgis'");
   const tables=await this.db.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'");
   const ledger=await this.db.query('SELECT filename,sha256 FROM assettrust_schema_migrations ORDER BY filename');
   const snapshot:SchemaSnapshot={postgis:Boolean(extension.rowCount),tables:tables.rows.map(x=>x.tablename),migrations:ledger.rows};
   const decision=evaluateSchema(snapshot);
   if(!decision.ready)return {ready:false,reason:decision.reason||'Schema readiness unverified'};
   // Verify actual runtime role/RLS catalog on every readiness call, not only
   // during application startup. Fail closed if a policy is added or weakened.
   const isolation=await this.db.assertRuntimeIsolation();
   return {ready:true as const,verifiedMigrations:snapshot.migrations.length,
    policiesVerified:isolation.policiesVerified,tablesVerified:isolation.tablesVerified};
  }catch{return {ready:false,reason:'Database schema or security policy not verified'};}
 }
 async assertReady(){const state=await this.check();if(!state.ready)throw new ServiceUnavailableException('AssetTrust database schema is not ready. Run and verify migrations before starting the API.');return state;}
}
