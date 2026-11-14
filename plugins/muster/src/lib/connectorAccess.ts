import type { AuthStatusResponse } from '../apis';
import type { MCPServer } from './k8s';
import { MUSTER_NAMESPACE } from './musterNamespace';
import {
  connectorReach,
  connectorStatus,
} from '../components/CustomizeConnectorsPanel/connectorRows';
import type { ServerListEntry } from './serverList';

export function connectorAuthName(server: MCPServer): string {
  const namespace = server.getNamespace();
  return namespace && namespace !== MUSTER_NAMESPACE
    ? `${namespace}/${server.getName()}`
    : server.getName();
}

export function instanceAccess(server: MCPServer, data?: AuthStatusResponse) {
  const name = connectorAuthName(server);
  const auth = data?.servers.find(status => status.name === name);
  const entry: ServerListEntry = {
    key: `server:${name}`,
    id: name,
    displayName: server.getName(),
    row: { kind: 'server', server },
    tags: [],
    shadowed: false,
  };
  if (server.getSuspended()) {
    return {
      name,
      auth,
      reach: connectorReach(entry, auth),
      status: connectorStatus(entry, auth),
    };
  }
  if (!server.getSuspended() && (!data || data.unavailable || !auth)) {
    return {
      name,
      auth,
      reach: 'not-connected' as const,
      status: {
        label: data ? 'Status unavailable' : 'Checking access',
        tone: 'neutral' as const,
      },
    };
  }
  if (
    auth &&
    auth.status !== 'connected' &&
    auth.status !== 'sso_pending' &&
    auth.kind === 'sso'
  ) {
    return {
      name,
      auth,
      reach: 'not-connected' as const,
      status: {
        label: 'Cannot connect',
        tone: 'danger' as const,
        explanation: auth.error,
      },
    };
  }
  if (
    auth &&
    auth.status !== 'connected' &&
    !['auth_required', 'reauth_required', 'sso_pending'].includes(auth.status)
  ) {
    return {
      name,
      auth,
      reach: 'not-connected' as const,
      status: {
        label: 'Cannot connect',
        tone: 'danger' as const,
        explanation: auth.error,
      },
    };
  }
  const status = connectorStatus(entry, auth);
  if (auth?.status === 'connected' && status.label !== 'Portal only') {
    return {
      name,
      auth,
      reach: 'connected' as const,
      status: { label: 'Connected', tone: 'success' as const },
    };
  }
  return {
    name,
    auth,
    reach: connectorReach(entry, auth),
    status,
  };
}

export function familyAccess(servers: MCPServer[], data?: AuthStatusResponse) {
  const members = servers.map(server => instanceAccess(server, data));
  const connected = members.filter(
    member => member.reach === 'connected' || member.reach === 'portal-only',
  ).length;
  if (connected === members.length && members.length > 0) {
    const portalOnly = members.some(member => member.reach === 'portal-only');
    return {
      reach: portalOnly ? ('portal-only' as const) : ('connected' as const),
      status: {
        label: portalOnly ? 'Portal only' : 'Connected',
        tone: portalOnly ? ('warning' as const) : ('success' as const),
      },
    };
  }
  if (connected > 0) {
    return {
      reach: 'partial' as const,
      status: {
        label: 'Partly connected',
        tone: 'warning' as const,
        explanation: `${connected} of ${members.length} instances are connected for you. View instances to check the others.`,
      },
    };
  }
  if (
    members.length > 0 &&
    members.every(member => member.reach === 'deactivated')
  ) {
    return {
      reach: 'deactivated' as const,
      status: { label: 'Deactivated', tone: 'neutral' as const },
    };
  }
  if (
    members.length > 0 &&
    members.every(member => member.reach === 'sign-in')
  ) {
    return {
      reach: 'sign-in' as const,
      status: {
        label: 'Sign in needed',
        tone: 'warning' as const,
        explanation: 'Sign in to the instances to see their tools.',
      },
    };
  }
  if (
    members.some(
      member =>
        member.status.label === 'Status unavailable' ||
        member.status.label === 'Checking access',
    )
  ) {
    return {
      reach: 'not-connected' as const,
      status: {
        label: data ? 'Status unavailable' : 'Checking access',
        tone: 'neutral' as const,
      },
    };
  }
  return {
    reach: 'not-connected' as const,
    status: {
      label: 'Cannot connect',
      tone: 'danger' as const,
      explanation: 'View instances to check why their tools are unavailable.',
    },
  };
}
