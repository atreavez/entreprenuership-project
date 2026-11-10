import {Injectable,ServiceUnavailableException} from '@nestjs/common';
import {Database} from '../../../database';
import {evaluateSchema,type SchemaSnapshot} from '../domain/schema-readiness';
@Injectable()
export class SchemaProbe{
 constructor(private readonly db:Database){}
 async check(){
  try{
   const extension=await this.db.query("SELECT 1 FROM pg_extension WHERE extname='postgis'");
   const tables=await this.db.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'");
   const ledger=await this.db.query('SELECT filename,sha256 FROM assettrust_schema_migrations ORDER BY filename');
   const snapshot:SchemaSnapshot={postgis:Boolean(extension.rowCount),tables:tables.rows.map(x=>x.tablename),migrations:ledger.rows};
   return evaluateSchema(snapshot);
  }catch{return {ready:false,reason:'Database unavailable or schema ledger missing'};}
 }
 async assertReady(){const state=await this.check();if(!state.ready)throw new ServiceUnavailableException('AssetTrust database schema is not ready. Run and verify migrations before starting the API.');return state;}
}
