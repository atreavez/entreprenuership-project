import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validDueDate} from '../src/operations';
import {invitationExpired} from '../src/team';
import {localProof} from '../src/integrations';
test('malformed dates are rejected before scheduling',()=>{
 assert.throws(()=>validDueDate('not-a-date'));
 assert.equal(validDueDate('2026-12-01T09:00:00Z'),'2026-12-01T09:00:00.000Z');
});
test('invitation expiration is checked with a stable clock',()=>{
 assert.equal(invitationExpired(new Date('2026-11-05T10:00:00Z'),Date.parse('2026-11-06T10:00:00Z')),true);
 assert.equal(invitationExpired(new Date('2026-11-07T10:00:00Z'),Date.parse('2026-11-06T10:00:00Z')),false);
});
test('local commitment binds the organization and audit head',()=>{
 const a=localProof('org-1','head-a'); assert.equal(a.length,64);
 assert.notEqual(a,localProof('org-2','head-a'));
 assert.notEqual(a,localProof('org-1','head-b'));
});
