'use strict';
/** Safety policy for v0.21 disposable PostgreSQL integration assertions.
 * No external dependencies. No network, mutation, or side effects. */
function validateDisposablePgTarget(env) {
  if (env.ASSETTRUST_E2E_ALLOW_MUTATION !== 'YES') throw Error('Explicit disposable-data authorization required');
  if (env.NODE_ENV !== 'test') throw Error('NODE_ENV=test required');
  if (typeof env.DATABASE_URL !== 'string') throw Error('DATABASE_URL is required');
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw Error('Invalid PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error('PostgreSQL URL required');
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw Error('Only a loopback PostgreSQL server is permitted');
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z][a-zA-Z0-9_]*_(?:ci|test)$/.test(databaseName)) throw Error('Only disposable *_ci or *_test databases are permitted');
  if (url.search) throw Error('Query-string PostgreSQL connection overrides are not permitted for this disposable test');
  return {databaseName,host:url.hostname};
}
module.exports={validateDisposablePgTarget};
