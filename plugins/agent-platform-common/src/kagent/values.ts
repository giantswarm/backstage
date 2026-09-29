/** A string with something in it, or undefined for anything else. */
export function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}
