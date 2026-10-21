/** Validate a schema or prefix before constructing SQL identifiers.
 * @example
 * validateIdentifier('public', 30); // true
 */
export function validateIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' && value.length >= 1 && value.length <= maxLength && /^[a-z_][a-z0-9_]*$/.test(value)
  );
}

/** Quote an identifier; callers validate configurable names first.
 * @example
 * quoteIdent('public'); // '"public"'
 */
export function quoteIdent(value: string): string {
  return '"' + value.replaceAll('"', '""') + '"';
}
