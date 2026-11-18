/**
 * Derives a URL/DNS-friendly slug from a free-text name, at most `maxLength`
 * characters (a DNS label's 63 by default).
 */
export function slugify(value: string, maxLength = 63): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}
