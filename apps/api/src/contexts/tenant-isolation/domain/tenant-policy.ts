/** Pure domain boundary: never allow SQL identifiers, wildcard scopes, or arbitrary GUC values. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateTenantId(value:unknown):string {
 if(typeof value !== 'string' || !UUID.test(value)) throw new Error('A valid organization UUID is required for tenant-scoped database access');
 return value.toLowerCase();
}
