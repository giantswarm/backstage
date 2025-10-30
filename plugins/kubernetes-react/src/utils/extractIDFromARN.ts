export function extractIDFromARN(arn?: string) {
  if (!arn) return undefined;

  const parts = arn.split(':');
  if (parts.length < 4) return '';

  return parts[4];
}
