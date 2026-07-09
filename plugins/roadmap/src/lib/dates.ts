/**
 * Locale-formatted date ("Jul 8, 2026"), optionally with time, for item
 * and comment timestamps. Undefined for missing or unparsable input.
 */
export function formatDate(
  value: string | null | undefined,
  options: { time?: boolean } = {},
): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return undefined;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(options.time && { hour: '2-digit', minute: '2-digit' }),
  });
}
