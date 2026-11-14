#!/usr/bin/env bash
# AssetTrust v0.42: explicit, disposable-only local verification.
# Never use against customer or production records. Does not grant production approval.
set -euo pipefail
cd "$(dirname "$0")/.."
# Fail before installing, migrating, or starting ANY process if the destination is unsafe.
node -e "require('./tools/two-api-policy-v42.cjs').assertTwoApiEnvironment(process.env);if(process.env.ASSETTRUST_V41_CONCURRENCY_CONTRACT!=='YES')throw Error('Authorize the v0.41 two-session disposable contract explicitly');"
if [[ ! -f package-lock.json ]]; then
  echo 'BLOCKED: authentic package-lock.json missing; generate online, review, and commit it before running npm ci.' >&2
  exit 2
fi
npm ci
npm run verify:ci:v41
npm run release:gate:v17
for n in $(seq -w 3 42); do
  npm run "verify:v${n}"
done
npm run verify:architecture
npm run verify:syntax
npm test
npm run build
npm run db:migrate
npm run db:check
npm run test:pg:shared-counter:v41
npm run test:e2e:two-api:v42
printf '%s\n' 'PASS: v0.42 disposable checks finished. NOT production approval; authenticated browser, valid-share cross-node race, restore drill and security/legal review remain.'
