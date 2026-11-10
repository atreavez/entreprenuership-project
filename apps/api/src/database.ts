import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
@Injectable()
export class Database implements OnModuleDestroy {
 private pool:Pool;
 constructor() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  this.pool = new Pool({connectionString:process.env.DATABASE_URL,max:12,connectionTimeoutMillis:5000});
 }
 query<T extends QueryResultRow=any>(sql:string,params:any[]=[]){return this.pool.query<T>(sql,params);}
 async transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await this.pool.connect();try{await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 async onModuleDestroy(){await this.pool.end();}
}
@Global()
@Module({providers:[Database],exports:[Database]})export class DatabaseModule{}
