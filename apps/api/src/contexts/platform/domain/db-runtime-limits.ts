/** Mandatory bounded query and connection policy for the online API pool.
 * This is deliberately static: runtime env/HTTP input must not disable limits.
 * Migrations run through a separate tool/connection, not the API pool.
 */
export const ONLINE_DATABASE_LIMITS = Object.freeze({
 max: 12,
 connectionTimeoutMillis: 5_000,
 statement_timeout: 15_000,
 query_timeout: 20_000,
 lock_timeout: 3_000,
 idle_in_transaction_session_timeout: 30_000,
});
