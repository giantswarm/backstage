import type { SeenMarkTarget } from '@giantswarm/backstage-plugin-agent-platform';
import type { McpServerAwaitingSignIn } from '@giantswarm/backstage-plugin-muster';
import type { InboxRow } from '../types';

/**
 * The link that opens muster's sign-in dialog where the person is: the MCP
 * sign-in toast's Sign in, and its desktop notification.
 */
export const MCP_SIGN_IN_HASH = '#mcp-sign-in';

/** How many server names the row spells out before "and n more". */
const NAMED_SERVERS = 3;

const PREFIX = 'mcp-sign-in:';

/** The subject of an installation's MCP sign-in row: the installation. */
export function mcpSignInSubject(installation: string): string {
  return `${PREFIX}${installation}`;
}

/**
 * The MCP sign-in row's identity, and its seen mark: the installation and
 * the set of servers waiting there, by name.
 */
export function mcpSignInMark(
  installation: string,
  servers: readonly string[],
): string {
  return `${mcpSignInSubject(installation)}:${[...servers].sort().join(',')}`;
}

/**
 * The servers an installation's MCP sign-in mark names; undefined for a mark
 * of another installation, or none.
 */
export function serversOfMcpSignInMark(
  mark: string | undefined,
  installation: string,
): string[] | undefined {
  const prefix = `${mcpSignInSubject(installation)}:`;
  if (mark === undefined || !mark.startsWith(prefix)) {
    return undefined;
  }
  const names = mark.slice(prefix.length);
  return names ? names.split(',') : [];
}

function namedList(labels: string[]): string {
  const shown = labels.slice(0, NAMED_SERVERS);
  const more = labels.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ');
}

export type McpSignInRowInput = {
  installation: string;
  /** The servers waiting for the person's sign-in or grant. */
  waiting: readonly McpServerAwaitingSignIn[];
  /** The servers named by the row the person last saw, if any. */
  seen: readonly string[] | undefined;
  /** Opens muster's sign-in dialog. */
  openSignIn: () => void;
};

/**
 * The installation's MCP sign-in row, while any of its servers waits for the
 * person's sign-in or grant: one row naming them all, with a Sign in that
 * opens muster's sign-in dialog in place.
 *
 * The row's identity is the installation and the set of waiting servers.
 * It is unread while a server waits that the row the person last saw did not
 * name: a server that starts to wait makes it unread again, a sign-in that
 * leaves fewer waiting does not. It is no news either way: fewer servers
 * waiting only narrows a row the tab has read.
 *
 * It names the servers' display names, and nothing the agent or the person
 * wrote.
 */
export function toMcpSignInRow({
  installation,
  waiting,
  seen,
  openSignIn,
}: McpSignInRowInput): InboxRow | undefined {
  if (waiting.length === 0) {
    return undefined;
  }
  const names = waiting.map(server => server.name);
  const id = mcpSignInMark(installation, names);
  const title =
    waiting.length === 1
      ? '1 MCP server needs your sign-in'
      : `${waiting.length} MCP servers need your sign-in`;
  const servers = namedList(waiting.map(server => server.label));
  const seenMark: SeenMarkTarget = {
    kind: 'mcpSignIn',
    installation,
    mark: id,
  };
  return {
    id,
    subject: mcpSignInSubject(installation),
    kind: 'mcpSignIn',
    pinned: true,
    unread: !seen || names.some(name => !seen.includes(name)),
    title,
    context: servers,
    icon: 'signIn',
    action: {
      label: 'Sign in',
      accessibleLabel: 'Sign in to MCP servers',
      onAction: openSignIn,
    },
    announce: {
      title,
      description: servers,
      status: 'warning',
      linkLabel: 'Sign in',
      href: MCP_SIGN_IN_HASH,
    },
    seenMark,
    narrows: previous => {
      const before = serversOfMcpSignInMark(previous, installation);
      return Boolean(before && names.every(name => before.includes(name)));
    },
  };
}
