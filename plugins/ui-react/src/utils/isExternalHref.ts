/**
 * Whether a link's `href` leads out of the portal: an absolute http(s) URL on
 * another origin. A path, a `#fragment`, a link to the portal's own origin and
 * any other scheme (`mailto:`, `tel:`) do not. Such a link is an
 * `ExternalLink`: it opens in a new tab and says so.
 */
export function isExternalHref(
  href: string,
  origin: string = window.location.origin,
): boolean {
  if (!/^(https?:)?\/\//i.test(href)) {
    return false;
  }
  try {
    return new URL(href, origin).origin !== origin;
  } catch {
    return false;
  }
}
