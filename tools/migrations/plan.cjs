'use strict';
// Standalone, dependency-free migration plan. Deliberately not tied to NestJS.
const {readFileSync, readdirSync} = require('node:fs');
const {resolve} = require('node:path');
const {createHash} = require('node:crypto');
const ROOT = resolve(__dirname, '../..');
const SQL_DIR = resolve(ROOT, 'apps/api/sql');
const SHA256 = data => createHash('sha256').update(data).digest('hex');
const MIGRATION_RE = /^\d{3}_[a-z0-9_]+\.sql$/;
function stripTransactionEnvelope(contents, filename){
 const lines=contents.replace(/\r\n/g,'\n').trim().split('\n');
 if (!/^BEGIN;\s*(?:--.*)?$/i.test(lines[0].trim()) || !/^COMMIT;\s*(?:--.*)?$/i.test(lines.at(-1).trim()))
  throw new Error(`${filename}: migration must have a single explicit BEGIN/COMMIT wrapper`);
 const sql=lines.slice(1,-1).join('\n').trim();
 // A nested transaction could commit before the migration ledger is written.
 const nonCommentLines=sql.split('\n').filter(s=>!s.trimStart().startsWith('--')).join('\n');
 if(/(?:^|;)\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/i.test(nonCommentLines) || !sql)
  throw new Error(`${filename}: nested transaction commands or empty migration are not supported`);
 return sql;
}
function buildPlan(dir=SQL_DIR){
 const files=readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
 if(files.some(f=>!MIGRATION_RE.test(f))) throw new Error('Invalid migration filename');
 for(let i=0;i<files.length;i++)if(!files[i].startsWith(String(i+1).padStart(3,'0')+'_'))throw new Error('Missing or duplicate migration number near '+files[i]);
 return files.map(filename=>{
  const bytes=readFileSync(resolve(dir,filename));
  const sql=stripTransactionEnvelope(bytes.toString('utf8'),filename);
  return {filename,sha256:SHA256(bytes),sql};
 });
}
function validateLedger(plan,applied){
 const expected=new Map(plan.map(m=>[m.filename,m]));
 const actual=new Map();
 for(const row of applied){
  if(actual.has(row.filename))throw new Error('Duplicate applied migration '+row.filename);
  actual.set(row.filename,row.sha256);
  if(!expected.has(row.filename))throw new Error('Unknown applied migration '+row.filename);
  if(expected.get(row.filename).sha256!==row.sha256)throw new Error('Migration checksum mismatch for '+row.filename+'; do not modify applied SQL');
 }
 let missing=false;
 for(const m of plan){
  if(!actual.has(m.filename))missing=true;
  else if(missing)throw new Error('Migration ledger has a noncontiguous history at '+m.filename);
 }
 return plan.filter(m=>!actual.has(m.filename));
}
module.exports={ROOT,SQL_DIR,buildPlan,stripTransactionEnvelope,validateLedger};
