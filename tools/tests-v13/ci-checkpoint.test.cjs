'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const yaml = readFileSync(resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8');

test('CI does not store static signing or encryption secrets', () => {
 assert.doesNotMatch(yaml, /^\s+(?:JWT_SECRET|MFA_ENCRYPTION_KEY|DOCUMENT_ENCRYPTION_KEYS):\s*\S/m);
});

test('CI generates independent cryptographic secrets before environment preflight', () => {
 assert.match(yaml, /name: Generate disposable security keys/);
 assert.match(yaml, /JWT_SECRET=\$\(openssl rand -hex 32\)/);
 assert.match(yaml, /MFA_ENCRYPTION_KEY=\$\(openssl rand -hex 32\)/);
 assert.match(yaml, /DOCUMENT_ENCRYPTION_KEYS=/);
 assert.match(yaml, /name: Check runtime configuration/);
 assert.match(yaml, /node tools\/ci-security-preflight\.cjs/);
 assert.ok(yaml.indexOf('name: Generate disposable security keys') < yaml.indexOf('name: Check runtime configuration'));
 assert.ok(yaml.indexOf('name: Check runtime configuration') < yaml.indexOf('name: Compile API and React'));
});

test('CI runs integration tests under supervised process management', () => {
 assert.match(yaml, /node tools\/ci-live-integration\.mjs/);
 assert.doesNotMatch(yaml, /npm run start --workspace apps\/api > \/tmp\/assettrust-api\.log/);
 assert.match(yaml, /verify:v13/);
});

test('CI runs fresh migrations and repeats them to detect drift', () => {
 assert.match(yaml, /npm run db:migrate --workspace apps\/api/);
 assert.match(yaml, /npm run db:check --workspace apps\/api/);
});
