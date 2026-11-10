import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditHash} from '../src/audit';
test('audit hashes deterministically bind organization, event, details and predecessor',()=>{
 const base=['org-1','actor-1','CASE_CREATED','case','c-1',{stage:'INTAKE'},'2026-11-06T10:00:00.000Z','GENESIS'] as const;
 const a=auditHash(...base);
 assert.equal(a.length,64);
 assert.equal(a,auditHash(...base));
 assert.notEqual(a,auditHash('org-2',base[1],base[2],base[3],base[4],base[5],base[6],base[7]));
 assert.notEqual(a,auditHash(base[0],base[1],base[2],base[3],base[4],{stage:'CLOSED'},base[6],base[7]));
 assert.notEqual(a,auditHash(base[0],base[1],base[2],base[3],base[4],base[5],base[6],'different-previous-hash'));
});
