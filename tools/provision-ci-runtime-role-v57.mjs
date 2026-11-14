/** v0.57 disposable-PostgreSQL-only CI runtime-role provisioning.
 * Requires operator role to create a separate non-bypass login for API tests.
 * Does NOT rotate production passwords or mutate any non-disposable DB.
 */
import {randomBytes} from 'node:crypto';
import {appendFileSync,existsSync,lstatSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {RUNTIME_ROLE}=require('./runtime-role-policy-v57.cjs');
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||process.env.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES')
 throw Error('BLOCKED: disposable CI test mode and explicit mutation consent required');
const target=validateDisposablePgTarget(process.env);
if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))throw Error('BLOCKED: unexpected CI database name');
if(!process.env.GITHUB_ENV||!existsSync(process.env.GITHUB_ENV))throw Error('BLOCKED: secure environment output file required');
const outputStat=lstatSync(process.env.GITHUB_ENV);
if(!outputStat.isFile()||outputStat.isSymbolicLink()||(process.env.GITHUB_ACTIONS!=='true'&&(outputStat.mode&0o077)!==0))
 throw Error('BLOCKED: local credential output must be a private regular file (0600), never a symlink');
const {default:pg}=await import('pg');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
const password=randomBytes(32).toString('hex');
await client.connect();
try{
 const identity=(await client.query('SELECT rolsuper,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
 if(!identity?.rolcreaterole&&!identity?.rolsuper)throw Error('CI operator must be permitted to create the restricted role');
 const existing=(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[RUNTIME_ROLE])).rowCount;
 if(existing)throw Error('Refusing to overwrite any existing runtime role');
 await client.query(`CREATE ROLE ${RUNTIME_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`);
 await client.query(`GRANT CONNECT ON DATABASE ${target.databaseName} TO ${RUNTIME_ROLE}`);
 await client.query(`GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE}`);
 await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${RUNTIME_ROLE}`);
 // v0.60: this disposable runtime API must read migration status but never alter
 // recorded migration fingerprints. Audit events may be appended, not rewritten.
 // Keep these REVOKEs after blanket application table grants.
 await client.query(`REVOKE INSERT,UPDATE,DELETE ON TABLE public.assettrust_schema_migrations FROM ${RUNTIME_ROLE}`);
 await client.query(`REVOKE UPDATE,DELETE ON TABLE public.audit_events FROM ${RUNTIME_ROLE}`);
 await client.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${RUNTIME_ROLE}`);
 const url=new URL(process.env.DATABASE_URL);
 url.username=RUNTIME_ROLE;url.password=password;
 // GitHub Actions interprets add-mask commands; a normal Kali shell does not.
 // Never print the credential or URL to a normal terminal/log.
 if(process.env.GITHUB_ACTIONS==='true'){
  console.log('::add-mask::'+password);
  console.log('::add-mask::'+url.toString());
 }
 appendFileSync(process.env.GITHUB_ENV,`ASSETTRUST_RUNTIME_DATABASE_URL=${url.toString()}\n`,{encoding:'utf8'});
 console.log('Provisioned disposable non-bypass API runtime login (credential redacted)');
}finally{await client.end()}
