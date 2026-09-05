/**
 * Sanitize a value for use inside a PromQL label matcher string.
 * Strips characters that could break or escape the matcher: `"`, `}`, `\`, newlines.
 */
export function sanitizePromQLValue(value: string): string {
  return value.replace(/["}\\\n\r]/g, '');
}
