/**
 * Whether any field contains `needle`, already trimmed and lower-cased: the
 * plugin's substring search over a row's words.
 */
export function matches(
  needle: string,
  fields: (string | undefined)[],
): boolean {
  return fields.some(field => field?.toLowerCase().includes(needle));
}
