import type { StatusDotTone } from '@giantswarm/backstage-plugin-ui-react';
import { countNoun } from '@giantswarm/backstage-plugin-ui-react';
import {
  MCPServer,
  mcpServerStateSeverity,
  worstSeverity,
  type MCPServerSeverity,
} from '../../lib/k8s';
import { selectRepresentative } from '../../lib/serverGrouping';
import type { ServerListEntry } from '../../lib/serverList';
import { serverAuthMode, type ServerAuthMode } from '../../lib/serverAuthMode';
import type { ServerAuthStatus } from '../../apis/types';
import type { StatusText } from '../shared';

/** How a person gets into a server, in the shell's words. */
export const SHELL_AUTH_LABELS: Record<ServerAuthMode, string> = {
  anonymous: 'No sign-in',
  'own-account': 'Your own account',
  'platform-sso': 'Company login',
  'token-exchange': 'Company login',
  sigv4: 'Shared AWS identity',
  unknown: 'Other sign-in',
};

const SEVERITY_TONE: Record<MCPServerSeverity, StatusDotTone> = {
  ok: 'success',
  warning: 'warning',
  error: 'danger',
  unknown: 'neutral',
};

/** The server that speaks for a row: itself, or a family's representative. */
export function rowServer(
  entry: ServerListEntry,
  installation: string,
): MCPServer | undefined {
  if (entry.row.kind === 'server') {
    return entry.row.server;
  }
  if (entry.row.kind === 'family') {
    return selectRepresentative(entry.row.servers, installation)?.server;
  }
  return undefined;
}

export function authLabel(server: MCPServer | undefined): string {
  return server ? SHELL_AUTH_LABELS[serverAuthMode(server)] : '';
}

/** "12 tools", or nothing while the tools are unknown. */
export function toolsLabel(entry: ServerListEntry): string | undefined {
  if (entry.toolCount === undefined) {
    return undefined;
  }
  if (entry.toolMatches !== undefined && entry.toolMatches > 0) {
    return `${entry.toolMatches} of ${entry.toolCount} tools match`;
  }
  return countNoun(entry.toolCount, 'tool');
}

/**
 * A row's state: for one server, this person's sign-in when muster reports one
 * that asks something of them, else the server's own state; for a family, how
 * many of its instances are healthy.
 */
export function connectorStatus(
  entry: ServerListEntry,
  authStatus?: ServerAuthStatus,
): StatusText {
  if (entry.row.kind === 'family') {
    const servers = entry.row.servers;
    const healthy = servers.filter(
      server => mcpServerStateSeverity(server.getState()) === 'ok',
    ).length;
    return {
      label:
        healthy === servers.length
          ? 'Connected'
          : `${healthy} of ${servers.length} connected`,
      tone: SEVERITY_TONE[
        servers
          .map(s => mcpServerStateSeverity(s.getState()))
          .reduce<MCPServerSeverity>(worstSeverity, 'ok')
      ],
    };
  }
  if (entry.row.kind !== 'server') {
    return { label: '', tone: 'neutral' };
  }
  const server = entry.row.server;
  if (server.getSuspended()) {
    return { label: 'Deactivated', tone: 'neutral' };
  }
  if (authStatus?.status === 'reauth_required') {
    return { label: 'Sign-in expired', tone: 'warning' };
  }
  if (authStatus?.status === 'auth_required') {
    return { label: 'Sign in needed', tone: 'warning' };
  }
  const state = server.getState();
  const severity = mcpServerStateSeverity(state);
  if (severity === 'ok') {
    return { label: 'Connected', tone: 'success' };
  }
  return { label: state ?? 'Unknown', tone: SEVERITY_TONE[severity] };
}

/** Whether a person can reach a connector's tools now, in a few buckets. */
export type ConnectorReach =
  'connected' | 'partial' | 'sign-in' | 'not-connected' | 'deactivated';

export const CONNECTOR_REACH_LABELS: Record<ConnectorReach, string> = {
  connected: 'Connected',
  partial: 'Partly connected',
  'sign-in': 'Sign-in needed',
  'not-connected': 'Not connected',
  deactivated: 'Deactivated',
};

/** The order the Connection filter offers its buckets in. */
export const CONNECTOR_REACH_ORDER: readonly ConnectorReach[] = [
  'connected',
  'partial',
  'sign-in',
  'not-connected',
  'deactivated',
];

/**
 * A row's {@link connectorStatus} as a filter bucket (T49): the many states
 * muster reports fold into whether the tools answer, answer for some of a
 * family, wait on this person's sign-in, do not answer, or are switched off.
 */
export function connectorReach(
  entry: ServerListEntry,
  authStatus?: ServerAuthStatus,
): ConnectorReach | undefined {
  if (entry.row.kind === 'family') {
    const healthy = entry.row.servers.filter(
      server => mcpServerStateSeverity(server.getState()) === 'ok',
    ).length;
    if (healthy === entry.row.servers.length) {
      return 'connected';
    }
    return healthy > 0 ? 'partial' : 'not-connected';
  }
  if (entry.row.kind !== 'server') {
    return undefined;
  }
  const server = entry.row.server;
  if (server.getSuspended()) {
    return 'deactivated';
  }
  if (
    authStatus?.status === 'reauth_required' ||
    authStatus?.status === 'auth_required'
  ) {
    return 'sign-in';
  }
  return mcpServerStateSeverity(server.getState()) === 'ok'
    ? 'connected'
    : 'not-connected';
}
