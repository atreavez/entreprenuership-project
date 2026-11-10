/** v0.11: Direct invocation is disallowed; use the checksum-aware migration CLI. */
throw new Error('Direct migrate.ts execution is unsupported. Use npm run db:migrate --workspace apps/api or npm run db:check.');
