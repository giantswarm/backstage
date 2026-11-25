/**
 * An MCP server's URL elicitation the agent waits on, handled the same way
 * whatever it asks for (giantswarm/giantswarm#38902, slice 6): muster's sign-in
 * to a connector, its approval page for a tool call, or any later page.
 *
 * Every link opens through the consent dialog. Only a link to one of
 * muster's own pages that return the browser (its approval page, its sign-in
 * start), on muster's origin, gets `redirect`: the page muster returns the
 * browser to once the person is done there. The return carries a random
 * value the opening tab made for that one open, so only that tab resumes the
 * agent, once; a visit to the session page with a guessed or relayed
 * `elicitationId` does nothing. The return never says what was decided: the
 * outcome is muster's answer to the call the agent retries.
 *
 * Pure functions over plain data, like `lib/connectorSignIn`.
 */

import { isWebURL } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The query parameter of the page muster returns the browser to: the
 * `elicitationId` of the elicitation the person finished. muster's approval
 * page sets it itself on its return (contract §5); for its sign-in, whose
 * return does not name it, the portal puts it in the `redirect`.
 */
export const ELICITATION_RETURN_PARAM = 'elicitationId';

/**
 * The query parameter of the return that names the one open of the link: a
 * random value the opening tab made and keeps, never sent anywhere else.
 */
export const ELICITATION_NONCE_PARAM = 'elicitationReturn';

/** The query parameter muster reads the page to return to from. */
export const ELICITATION_REDIRECT_PARAM = 'redirect';

/**
 * Where muster serves its own pages: the origin and the path they sit under
 * (`aggregator.oauth.mcpClient.publicUrl`; empty for the origin's root).
 */
export type MusterPages = { origin: string; basePath: string };

/** One of muster's pages that returns the browser to `redirect`. */
export type MusterPageKind = 'approval' | 'sign-in';

/**
 * muster's pages that return the browser to the portal, under its public URL:
 * the approval page `/approvals/<id>` (contract-muster-approval.md §5, a
 * 26-character base32 id) and the sign-in start `/oauth/proxy/start`
 * (muster's `DefaultOAuthProxyStartPath`). No other path on muster's origin
 * gets a return.
 */
const MUSTER_PAGES: ReadonlyArray<[RegExp, MusterPageKind]> = [
  [/^\/approvals\/[A-Za-z0-9]+$/, 'approval'],
  [/^\/oauth\/proxy\/start$/, 'sign-in'],
];

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

/**
 * Where muster serves its pages, from its public URL, or else from its MCP
 * endpoint (the same host, its `/mcp` path dropped).
 */
export function musterPagesOf(
  url: string | undefined,
): MusterPages | undefined {
  const parsed = parse(url);
  if (!parsed) {
    return undefined;
  }
  return {
    origin: parsed.origin,
    basePath: parsed.pathname.replace(/\/+$/, '').replace(/\/mcp$/, ''),
  };
}

/**
 * Which of muster's returning pages the link is, by its origin and its path
 * both; `undefined` for any other link, on muster's origin or not.
 */
export function musterPageKind(
  url: string | undefined,
  pages: MusterPages | undefined,
): MusterPageKind | undefined {
  const parsed = parse(url);
  if (!parsed || !pages || parsed.origin !== pages.origin) {
    return undefined;
  }
  const { pathname } = parsed;
  if (pages.basePath && !pathname.startsWith(`${pages.basePath}/`)) {
    return undefined;
  }
  const path = pathname.slice(pages.basePath.length);
  return MUSTER_PAGES.find(([pattern]) => pattern.test(path))?.[1];
}

/**
 * The link to open: to one of muster's returning pages, with an
 * `elicitationId` to come back with, the link with `redirect` to `back`,
 * which carries `nonce`; otherwise the link as the server sent it. The
 * approval page sets the `elicitationId` on its return itself, so a return
 * from it names the elicitation muster recorded, not the one relayed to the
 * page; the sign-in's return does not, so the portal names it. muster honours
 * the redirect only when the portal is on its post-login allowlist, and
 * otherwise shows its own page; the elicitation works either way, the person
 * then says *Done*.
 */
export function elicitationHref(
  url: string,
  options: {
    musterPages?: MusterPages;
    elicitationId?: string;
    nonce: string;
    back: string;
  },
): string {
  const { musterPages, elicitationId, nonce, back } = options;
  const kind = musterPageKind(url, musterPages);
  if (!elicitationId || !kind) {
    return url;
  }
  const page = new URL(back);
  page.searchParams.set(ELICITATION_NONCE_PARAM, nonce);
  if (kind === 'sign-in') {
    page.searchParams.set(ELICITATION_RETURN_PARAM, elicitationId);
  }
  const target = new URL(url);
  target.searchParams.set(ELICITATION_REDIRECT_PARAM, page.toString());
  return target.toString();
}

/**
 * What a page muster returned to carries: the elicitation and the open's
 * random value, both or nothing.
 */
export function returnedElicitation(
  search: URLSearchParams,
): { elicitationId: string; nonce: string } | undefined {
  const elicitationId = search.get(ELICITATION_RETURN_PARAM);
  const nonce = search.get(ELICITATION_NONCE_PARAM);
  return elicitationId && nonce ? { elicitationId, nonce } : undefined;
}

/** A random value for one open of a link: 128 bits, hex. */
export function newReturnNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
