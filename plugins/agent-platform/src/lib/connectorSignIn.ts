/**
 * Connector sign-ins an agent hands to the person (giantswarm/giantswarm#38774).
 * An agent that calls muster's `core_auth_login` for a connector gets a link
 * to muster's `/oauth/proxy/start` back and passes it on, in a message or an
 * `ask_user` question. Shown as is, it is a long opaque URL; the session shows
 * it as a sign-in to the connector instead — but only a link muster itself
 * issued in this session, for a connector the portal knows: the agent's own
 * text never decides what counts as a sign-in.
 *
 * Pure functions over plain data, like `lib/kagentTimeline`.
 */

import { isWebURL } from '@giantswarm/backstage-plugin-ui-react';

import type { AskUserQuestion } from './kagentHitl';
import type { TimelineItem } from './kagentTimeline';
import { SIGN_IN_TOOL } from './signInTool';
import { type ServerInfo, surfaceName } from './toolset';

/** The path of muster's sign-in start endpoint. */
export const MUSTER_SIGN_IN_PATH = '/oauth/proxy/start';

/**
 * The query parameter the page muster returns the browser to carries: which
 * sign-in it was, as the page that started it named it.
 */
export const SIGN_IN_RETURN_PARAM = 'connector-sign-in';

/**
 * The parameter muster adds on the way back: the server it connected. muster
 * returns to the page only from a successful callback (`finishSuccess`); a
 * denied consent or a failed code exchange ends on its own error page.
 */
export const SIGN_IN_RETURN_SERVER_PARAM = 'server';

/**
 * How long muster honours a sign-in link: the state behind it lives for 10
 * minutes (as `useServerSignIn` in the muster plugin knows it). Offered for a
 * little less, so a click at the edge still lands.
 */
export const SIGN_IN_LINK_LIFETIME_MS = 9 * 60 * 1_000;

/** One sign-in link muster issued in the session. */
export type ConnectorSignInLink = {
  /** What identifies the link, whatever else the agent did to its URL. */
  key: string;
  /** The URL as muster issued it. */
  url: string;
  /** muster's name for the server, as `core_auth_login` named it. */
  server: string;
  /**
   * The names muster may report the server by on the way back: as the call
   * named it, its CR's and its connector's.
   */
  servers: string[];
  /** The connector as people call it. */
  label: string;
  /** When muster answered with it, when known. */
  issuedAt?: string;
  /**
   * Set for the link of an MCP server's URL elicitation the agent waits on:
   * `label` then names the server that asked, not what the person signs in
   * to, and the server muster reports on the way back is not checked.
   */
  asked?: boolean;
};

/**
 * The key of a muster sign-in link — its origin, path and `state` — or
 * `undefined` for any other URL. The rest of the query is not part of it: the
 * agent may pass the link on with or without it.
 */
export function signInLinkKey(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  const state = url.searchParams.get('state');
  if (!isWebURL(url) || !url.pathname.endsWith(MUSTER_SIGN_IN_PATH) || !state) {
    return undefined;
  }
  return `${url.origin}${url.pathname}?state=${state}`;
}

const URL_PATTERN = /https?:\/\/[^\s"'<>`)\]\\]+/g;

/** The URLs in a text, without the punctuation a sentence ends them with. */
function urlsIn(text: string): string[] {
  return [...text.matchAll(URL_PATTERN)].map(([url]) =>
    url.replace(/[.,;:!?]+$/, ''),
  );
}

/**
 * Every string in a tool result, JSON-encoded text included: muster's
 * `call_tool` answers the inner tool's result as text.
 */
function stringsOf(value: unknown, depth = 0): string[] {
  if (depth > 6) {
    return [];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return stringsOf(JSON.parse(trimmed), depth + 1);
      } catch {
        return [value];
      }
    }
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(entry => stringsOf(entry, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(entry => stringsOf(entry, depth + 1));
  }
  return [];
}

/** The server a `core_auth_login` call named, from its arguments or its answer. */
function serverOfCall(args: unknown, texts: string[]): string | undefined {
  const named = (args as { server?: unknown } | undefined)?.server;
  if (typeof named === 'string' && named.trim()) {
    return named.trim();
  }
  for (const text of texts) {
    const match = /^Server: (\S+)$/m.exec(text);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

/**
 * The sign-in links muster issued in the session: the answers of its
 * `core_auth_login` calls, for a server among the installation's MCPServer
 * CRs. By {@link signInLinkKey}.
 */
export function connectorSignInLinks(
  items: readonly TimelineItem[],
  servers: ServerInfo[],
  labels: ReadonlyMap<string, string>,
): Map<string, ConnectorSignInLink> {
  const links = new Map<string, ConnectorSignInLink>();
  for (const item of items) {
    if (
      item.kind !== 'tool-call' ||
      item.toolName !== SIGN_IN_TOOL ||
      item.result === undefined
    ) {
      continue;
    }
    const texts = stringsOf(item.result);
    const server = serverOfCall(item.args, texts);
    const known = servers.find(
      candidate =>
        candidate.name === server || surfaceName(candidate) === server,
    );
    if (!server || !known) {
      continue;
    }
    for (const text of texts) {
      for (const url of urlsIn(text)) {
        const key = signInLinkKey(url);
        if (key && !links.has(key)) {
          links.set(key, {
            key,
            url,
            server,
            servers: [...new Set([server, known.name, surfaceName(known)])],
            label: labels.get(surfaceName(known)) ?? surfaceName(known),
            ...(item.at && { issuedAt: item.at }),
          });
        }
      }
    }
  }
  return links;
}

/** Whether two readings found the same links, so the first can be kept. */
export function sameSignInLinks(
  a: ReadonlyMap<string, ConnectorSignInLink>,
  b: ReadonlyMap<string, ConnectorSignInLink>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, link] of a) {
    const other = b.get(key);
    if (
      !other ||
      other.url !== link.url ||
      other.label !== link.label ||
      other.issuedAt !== link.issuedAt ||
      other.servers.join(',') !== link.servers.join(',')
    ) {
      return false;
    }
  }
  return true;
}

/** Whether muster no longer honours the link. Unknown age counts as fresh. */
export function isSignInLinkExpired(
  link: Pick<ConnectorSignInLink, 'issuedAt'>,
  now: number,
): boolean {
  const issued = link.issuedAt ? Date.parse(link.issuedAt) : NaN;
  return Number.isFinite(issued) && now - issued > SIGN_IN_LINK_LIFETIME_MS;
}

/**
 * The link with the page muster returns the browser to after the sign-in.
 * muster accepts it when the portal is on its post-login allowlist, and
 * otherwise drops it and shows its own page; the sign-in works either way.
 */
export function withSignInReturn(url: string, back: string): string {
  const target = new URL(url);
  target.searchParams.set('redirect', back);
  return target.toString();
}

/** Whether a question's text passes the link on. */
export function questionCarries(question: string, key: string): boolean {
  return urlsIn(question).some(url => signInLinkKey(url) === key);
}

const SIGNED_IN =
  /\b(signed|logged)[ -]?in\b|\bdone\b|\bfinished\b|\bcompleted?\b|\bconnected\b/i;
const NEGATED =
  /\b(not|never|no|can'?t|cannot|couldn'?t|unable|later|failed|didn'?t|won'?t)\b|n't\b|n’t\b/i;

/**
 * The answer that tells the agent the person signed in to `label`: the one
 * choice that says so, or a sentence where the question takes free text.
 * `undefined` with the reason it cannot be answered for them.
 */
export function signedInAnswer(
  questions: readonly AskUserQuestion[],
  label: string,
): { answers: string[][]; text: string } | { reason: string } {
  if (questions.length !== 1) {
    return {
      reason: 'The agent asked more than one thing, so answer it yourself.',
    };
  }
  const [question] = questions;
  if (!question.choices) {
    const text = `I've signed in to ${label}.`;
    return { answers: [[text]], text };
  }
  const fitting = question.choices.filter(
    choice => SIGNED_IN.test(choice) && !NEGATED.test(choice),
  );
  if (fitting.length !== 1) {
    return {
      reason:
        fitting.length === 0
          ? 'None of its choices says that you signed in, so answer it yourself.'
          : 'More than one of its choices could mean that you signed in, so answer it yourself.',
    };
  }
  return { answers: [[fitting[0]]], text: fitting[0] };
}
