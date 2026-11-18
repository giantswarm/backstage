import type { AuthStatusResponse, ServerAuthStatus } from '../apis';
import { MCPServer, mcpServerStateSeverity } from './k8s';
import { connectorAuthName } from './connectorKey';
import {
  connectorReach,
  connectorStatus,
  type ConnectorReach,
} from '../components/CustomizeConnectorsPanel/connectorRows';
import type { ExplainedStatusText } from '../components/shared/hooks';
import {
  isConnecting,
  isSsoRefused,
  needsSignIn,
  signInRefusalOf,
} from '../components/shared/useServerSignIn';
import type { ServerListEntry } from './serverList';

/** One connector instance as the person reaches it. */
export type InstanceAccess = {
  /** muster's name for the server in `auth://status`. */
  name: string;
  auth?: ServerAuthStatus;
  reach: ConnectorReach;
  status: ExplainedStatusText;
  /** The person's access could not be read yet, or at all. */
  unknown?: boolean;
};

/** A family of connector instances as the person reaches it. */
export type FamilyAccess = {
  reach: ConnectorReach;
  status: ExplainedStatusText;
  /** The members the person can sign in to now, by muster name. */
  waiting: string[];
};

function isHealthy(server: MCPServer): boolean {
  return mcpServerStateSeverity(server.getState()) === 'ok';
}

/**
 * The person's access to one server. A cause about the person (a sign-in, a
 * refused SSO connection, an unreadable status) wins over the server's own
 * state; a server that is itself not running shows that state, since no
 * sign-in would change it.
 */
export function instanceAccess(
  server: MCPServer,
  data?: AuthStatusResponse,
): InstanceAccess {
  const name = connectorAuthName(server);
  const auth = data?.servers.find(status => status.name === name);
  const entry: ServerListEntry = {
    key: `server:${name}`,
    id: server.getName(),
    displayName: server.getName(),
    row: { kind: 'server', server },
    tags: [],
    shadowed: false,
  };
  const fromState: InstanceAccess = {
    name,
    auth,
    reach: connectorReach(entry, auth) ?? 'not-connected',
    status: connectorStatus(entry, auth),
  };

  if (server.getSuspended()) {
    return fromState;
  }
  if (!data || data.unavailable || !auth) {
    if (!isHealthy(server)) {
      return fromState;
    }
    return {
      name,
      auth,
      reach: 'not-connected',
      status: {
        label: data ? 'Status unavailable' : 'Checking access',
        tone: 'neutral',
      },
      unknown: true,
    };
  }
  if (needsSignIn(auth) || isSsoRefused(auth) || isConnecting(auth)) {
    return fromState;
  }
  if (auth.status === 'connected') {
    return fromState.reach === 'portal-only'
      ? fromState
      : {
          name,
          auth,
          reach: 'connected',
          status: { label: 'Connected', tone: 'success' },
        };
  }
  if (!isHealthy(server)) {
    return {
      ...fromState,
      status: { ...fromState.status, explanation: auth.error },
    };
  }
  return {
    name,
    auth,
    reach: 'not-connected',
    status: {
      label: 'Cannot connect',
      tone: 'danger',
      explanation: auth.error,
    },
  };
}

const TONE_RANK: Record<ExplainedStatusText['tone'], number> = {
  danger: 4,
  warning: 3,
  neutral: 2,
  info: 1,
  success: 0,
};

function instances(count: number): string {
  return count === 1 ? '1 instance' : `${count} instances`;
}

/**
 * The person's access to a family, from its members': connected only when
 * every active member is, a sign-in first wherever one is waiting, else the
 * worst member's state.
 */
export function familyAccess(
  servers: MCPServer[],
  data?: AuthStatusResponse,
): FamilyAccess {
  const active = servers
    .map(server => instanceAccess(server, data))
    .filter(member => member.reach !== 'deactivated');
  if (active.length === 0) {
    return {
      reach: 'deactivated',
      status: { label: 'Deactivated', tone: 'neutral' },
      waiting: [],
    };
  }

  const waiting = active
    .filter(
      member =>
        member.reach === 'sign-in' &&
        member.auth &&
        !signInRefusalOf(member.auth),
    )
    .map(member => member.name);
  const signIn = active.filter(member => member.reach === 'sign-in').length;
  const connected = active.filter(
    member => member.reach === 'connected' || member.reach === 'portal-only',
  );

  if (connected.length === active.length) {
    const portalOnly = connected.some(member => member.reach === 'portal-only');
    return {
      reach: portalOnly ? 'portal-only' : 'connected',
      status: portalOnly
        ? { label: 'Portal only', tone: 'warning' }
        : { label: 'Connected', tone: 'success' },
      waiting,
    };
  }
  const others = active.length - connected.length - signIn;
  if (connected.length > 0) {
    return {
      reach: 'partial',
      status: {
        label: 'Partly connected',
        tone: 'warning',
        explanation: `${connected.length} of ${active.length} instances are connected for you. ${
          signIn > 0
            ? 'Sign in to the others to see their tools.'
            : 'View instances to check the others.'
        }`,
      },
      waiting,
    };
  }
  if (signIn > 0) {
    return {
      reach: 'sign-in',
      status: {
        label: 'Sign in needed',
        tone: 'warning',
        explanation:
          others > 0
            ? `Sign in to see its tools. ${instances(others)} cannot connect for another reason; view instances to check.`
            : 'Sign in to see its tools.',
      },
      waiting,
    };
  }
  const unknown = active.find(member => member.unknown);
  if (unknown) {
    return { reach: 'not-connected', status: unknown.status, waiting };
  }
  const worst = active.reduce((a, b) =>
    TONE_RANK[b.status.tone] > TONE_RANK[a.status.tone] ? b : a,
  );
  const same = active.every(
    member => member.status.label === worst.status.label,
  );
  return {
    reach: 'not-connected',
    status: {
      label: worst.status.label,
      tone: worst.status.tone,
      explanation:
        same && active.length === 1
          ? worst.status.explanation
          : 'View instances to check each one.',
    },
    waiting,
  };
}
