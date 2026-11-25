/**
 * An MCP server's URL elicitation the agent waits on, handled the same way
 * whatever it asks for (giantswarm/giantswarm#38902, slice 6): muster's sign-in
 * to a connector, its approval page for a tool call, or any later page. The
 * page never reads the link's path to decide what it is; it trusts a link by
 * its origin only.
 *
 * A link on muster's origin gets `redirect`, the page muster returns the
 * browser to once the person is done there, and the return names the
 * elicitation by its MCP `elicitationId`. The return never says what was
 * decided: the outcome is muster's answer to the call the agent retries.
 *
 * Pure functions over plain data, like `lib/connectorSignIn`.
 */

import { isWebURL } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The query parameter of the page muster returns the browser to: the
 * `elicitationId` of the elicitation the person finished. The page puts it in
 * the `redirect` it hands muster, and muster appends it (once more) on the
 * way back; either is enough.
 */
export const ELICITATION_RETURN_PARAM = 'elicitationId';

/** The query parameter muster reads the page to return to from. */
export const ELICITATION_REDIRECT_PARAM = 'redirect';

function parse(url: string | undefined): URL | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    return isWebURL(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The host the link leads to, as the *Open* button names it; `undefined` for
 * anything that is not an http(s) URL.
 */
export function linkHost(url: string | undefined): string | undefined {
  return parse(url)?.host || undefined;
}

/** The origin of muster's endpoint, which its own pages are served from. */
export function originOf(endpoint: string | undefined): string | undefined {
  return parse(endpoint)?.origin;
}

/** Whether the link is on `origin`, by origin alone: never by its path. */
export function isOnOrigin(
  url: string | undefined,
  origin: string | undefined,
): boolean {
  const parsed = parse(url);
  return Boolean(parsed && origin && parsed.origin === origin);
}

/**
 * The link to open: on muster's origin and with an `elicitationId` to come
 * back with, the link with `redirect` to `back`, which names the elicitation;
 * otherwise the link as the server sent it. muster honours the redirect only
 * when the portal is on its post-login allowlist, and otherwise shows its own
 * page; the elicitation works either way, the person then says *Done*.
 */
export function elicitationHref(
  url: string,
  options: {
    musterOrigin?: string;
    elicitationId?: string;
    back: string;
  },
): string {
  const { musterOrigin, elicitationId, back } = options;
  if (!elicitationId || !isOnOrigin(url, musterOrigin)) {
    return url;
  }
  const page = new URL(back);
  page.searchParams.set(ELICITATION_RETURN_PARAM, elicitationId);
  const target = new URL(url);
  target.searchParams.set(ELICITATION_REDIRECT_PARAM, page.toString());
  return target.toString();
}

/** The `elicitationId` a page muster returned to carries, if any. */
export function returnedElicitationId(
  search: URLSearchParams,
): string | undefined {
  return search.get(ELICITATION_RETURN_PARAM) || undefined;
}
