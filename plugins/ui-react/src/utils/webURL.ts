/**
 * Whether a parsed URL is a web address a link may lead to: http(s) with a
 * host. `javascript:`, `data:` and the like never are.
 */
export function isWebURL(url: URL): boolean {
  return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.host;
}

/**
 * A URL from outside the app (a service's answer, config) as an href, only
 * when it is an absolute web address ({@link isWebURL}); `undefined` for
 * anything else, so it is never rendered as a link.
 */
export function safeWebURL(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }
  try {
    return isWebURL(new URL(href.trim())) ? href.trim() : undefined;
  } catch {
    return undefined;
  }
}
