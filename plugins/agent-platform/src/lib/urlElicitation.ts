/**
 * An MCP server's URL elicitation the agent waits on, handled the same way
 * whatever it asks for: muster's sign-in
 * to a connector, its approval page for a tool call, or any later page.
 *
 * A link to the configured muster's approval page is decided in the chat
 * (`InlineApproval`); opened as a secondary way, it opens as sent. A link to
 * its connector sign-in start opens at once, with `redirect` (the page muster
 * returns the browser to once the person is done there) and, when muster
 * issues one, a one-time sign-in handoff ticket so the person is not asked to
 * sign in to muster again. Every other link opens through the consent
 * dialog. The return carries a random
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
 * `elicitationId` of the elicitation the person finished. muster's sign-in
 * return does not name it, so the portal puts it in the `redirect`.
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

/**
 * One of muster's own pages: its approval page (decided in the chat, opened
 * without the consent dialog) or its connector sign-in start (which returns
 * the browser to `redirect`).
 */
export type MusterPageKind = 'approval' | 'sign-in';

/**
 * muster's own pages under its public URL: the approval page `/approvals/<id>`
 * (contract-muster-approval.md §5, a 26-character base32 id) and the sign-in
 * start `/oauth/proxy/start` (muster's `DefaultOAuthProxyStartPath`). Only the
 * sign-in start gets a return.
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
 * The link to open: to muster's connector sign-in start, with an
 * `elicitationId` to come back with, the link with `redirect` to `back`,
 * which carries `nonce` and the `elicitationId`; otherwise (an approval page
 * included) the link as the server sent it. muster honours the redirect only
 * when the portal is on its post-login allowlist, and otherwise shows its own
 * page; the elicitation works either way, the person then says *Done*.
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
  if (!elicitationId || musterPageKind(url, musterPages) !== 'sign-in') {
    return url;
  }
  const page = new URL(back);
  page.searchParams.set(ELICITATION_NONCE_PARAM, nonce);
  page.searchParams.set(ELICITATION_RETURN_PARAM, elicitationId);
  const target = new URL(url);
  target.searchParams.set(ELICITATION_REDIRECT_PARAM, page.toString());
  return target.toString();
}

/**
 * The query parameter that carries muster's one-time sign-in handoff ticket
 * (contract-muster-approval.md §5a): the page redeems it, signs the browser
 * in as the person and drops it from the address.
 */
export const ELICITATION_HANDOFF_PARAM = 'handoff';

/** The link with muster's sign-in handoff ticket added, when there is one. */
export function withHandoff(href: string, ticket: string | undefined): string {
  if (!ticket) {
    return href;
  }
  const target = new URL(href);
  target.searchParams.set(ELICITATION_HANDOFF_PARAM, ticket);
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
