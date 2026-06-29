import {
  KubeObject,
  KubeObjectInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Label muster sets on every aggregated MCPServer CR identifying the target
 * management cluster the server talks to. Drives the fleet health matrix's
 * row dimension.
 */
export const MANAGEMENT_CLUSTER_LABEL =
  'muster.giantswarm.io/management-cluster';

/** Infrastructure state reported in `.status.state` (mirrors muster CRD enum). */
export type MCPServerState =
  | 'Running'
  | 'Starting'
  | 'Stopped'
  | 'Connected'
  | 'Auth Required'
  | 'Connecting'
  | 'Disconnected'
  | 'Failed';

export interface MCPServerFamily {
  name: string;
  instanceArg: string;
}

export interface MCPServerTokenExchange {
  enabled?: boolean;
  dexTokenEndpoint?: string;
  expectedIssuer?: string;
  connectorId?: string;
  scopes?: string;
}

export interface MCPServerAuth {
  type?: 'oauth' | 'none';
  forwardToken?: boolean;
  requiredAudiences?: string[];
  tokenExchange?: MCPServerTokenExchange;
  authorizationServer?: { issuer: string; scopes?: string };
  localMint?: { enabled?: boolean; audience?: string };
}

interface MCPServerInterface extends KubeObjectInterface {
  spec?: {
    type: 'stdio' | 'streamable-http' | 'sse';
    toolPrefix?: string;
    family?: MCPServerFamily;
    description?: string;
    autoStart?: boolean;
    command?: string;
    url?: string;
    timeout?: number;
    auth?: MCPServerAuth;
  };
  status?: {
    state?: MCPServerState;
    lastError?: string;
    lastConnected?: string;
    consecutiveFailures?: number;
    nextRetryAfter?: string;
  };
}

export class MCPServer extends KubeObject<MCPServerInterface> {
  static readonly supportedVersions = ['v1alpha1'] as const;
  static readonly group = 'muster.giantswarm.io';
  static readonly kind = 'MCPServer' as const;
  static readonly plural = 'mcpservers';

  getState() {
    return this.jsonData.status?.state;
  }

  getFamily() {
    return this.jsonData.spec?.family?.name;
  }

  getManagementCluster() {
    return this.findLabel(MANAGEMENT_CLUSTER_LABEL);
  }

  getType() {
    return this.jsonData.spec?.type;
  }

  getUrl() {
    return this.jsonData.spec?.url;
  }

  getAutoStart() {
    return this.jsonData.spec?.autoStart ?? false;
  }

  getTimeout() {
    return this.jsonData.spec?.timeout;
  }

  getDescription() {
    return this.jsonData.spec?.description;
  }

  getAuth() {
    return this.jsonData.spec?.auth;
  }

  getToolPrefix() {
    return this.jsonData.spec?.toolPrefix;
  }

  /**
   * The prefix muster gives this server's aggregated tools, used to filter the
   * catalogue down to one server (`filter_tools(pattern="<prefix>_*")`). Muster
   * builds names as `{musterPrefix}_{family.name | toolPrefix | name}_{tool}`
   * (registry.go). ponytail: musterPrefix is hardcoded to its default "x" — the
   * proxy does not expose the configured value. Upgrade path: surface
   * MusterPrefix via the backend overview/aggregator metadata.
   */
  getToolNamePrefix() {
    const segment =
      this.jsonData.spec?.family?.name ??
      this.jsonData.spec?.toolPrefix ??
      this.getName();
    return `x_${segment}`;
  }

  getLastConnected() {
    return this.jsonData.status?.lastConnected;
  }

  getLastError() {
    return this.jsonData.status?.lastError;
  }

  getConsecutiveFailures() {
    return this.jsonData.status?.consecutiveFailures;
  }

  getNextRetryAfter() {
    return this.jsonData.status?.nextRetryAfter;
  }
}

export type MCPServerSeverity = 'ok' | 'warning' | 'error' | 'unknown';

/**
 * Maps an MCPServer infrastructure state to a coarse severity used for the
 * dashboard health colouring.
 *
 * `Auth Required` is deliberately treated as healthy, not a warning: it means
 * the server needs a user session, which the browsing user already has. The
 * real per-user auth gap (if any) surfaces through the tool explorer's
 * `servers_requiring_auth` affordance, so rendering it as amber here would be a
 * false degraded signal.
 */
export function mcpServerStateSeverity(
  state: MCPServerState | undefined,
): MCPServerSeverity {
  switch (state) {
    case 'Running':
    case 'Connected':
    case 'Auth Required':
      return 'ok';
    case 'Starting':
    case 'Connecting':
    case 'Stopped':
    case 'Disconnected':
      return 'warning';
    case 'Failed':
      return 'error';
    default:
      return 'unknown';
  }
}

const SEVERITY_RANK: Record<MCPServerSeverity, number> = {
  ok: 0,
  unknown: 1,
  warning: 2,
  error: 3,
};

/** Returns the most severe of two severities (error > warning > unknown > ok). */
export function worstSeverity(
  a: MCPServerSeverity,
  b: MCPServerSeverity,
): MCPServerSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}
