import {
  KubeObject,
  KubeObjectInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Label muster sets on every aggregated MCPServer CR identifying the target
 * management cluster the server talks to. Drives the per-cluster pills on the
 * MCP servers page and the dashboard's fleet coverage.
 */
export const MANAGEMENT_CLUSTER_LABEL =
  'muster.giantswarm.io/management-cluster';

/**
 * Label the chart that ships an MCP server stamps on its CR to declare the
 * server's tool group -- the Agent Platform's tiering of MCP servers. Two
 * values; a CR without the label is a *Registered server* (anything an
 * installation or a user registers, through GitOps or the portal's Register
 * server flow, which sets no label by construction). The portal never infers
 * the tier from names, provenance or topology.
 */
export const TOOL_GROUP_LABEL = 'agent-platform.giantswarm.io/tool-group';

/** The two tool groups a chart can declare on an MCPServer CR. */
export type ToolGroup = 'agent-platform' | 'infrastructure';

/**
 * The three tool groups every surface renders -- the declared two plus
 * `registered` for servers without the label.
 */
export type ToolGroupKey = ToolGroup | 'registered';

export interface ToolGroupInfo {
  key: ToolGroupKey;
  /** Display name, identical on the MCP servers page, the Tools step and the docs. */
  title: string;
  /** One line explaining what belongs in the group. */
  description: string;
}

/**
 * The tool groups with their display names and one-line descriptions -- the
 * one vocabulary for the MCP servers page, the dashboard, the agent
 * creation Tools step and the agent detail page. Render them in
 * {@link TOOL_GROUP_ORDER}.
 */
export const TOOL_GROUPS: Readonly<Record<ToolGroupKey, ToolGroupInfo>> = {
  'agent-platform': {
    key: 'agent-platform',
    title: 'Agent Platform',
    description:
      "The platform's own management surface: the managers for agents, models and clusters, and muster's core tools. Writes act as the caller.",
  },
  infrastructure: {
    key: 'infrastructure',
    title: 'Infrastructure',
    description:
      'Servers for the infrastructure the platform runs on -- the management clusters this installation federates, as families with one instance per cluster.',
  },
  registered: {
    key: 'registered',
    title: 'Registered servers',
    description:
      'Everything this installation or its users registered -- integrations and shared services, through GitOps or the Register server flow.',
  },
};

/** The order the tool groups appear in on every surface. */
export const TOOL_GROUP_ORDER: readonly ToolGroupKey[] = [
  'agent-platform',
  'infrastructure',
  'registered',
];

const DECLARED_TOOL_GROUPS: readonly ToolGroup[] = [
  'agent-platform',
  'infrastructure',
];

/**
 * Narrow a label value to a declared tool group. Anything else -- absent,
 * empty, a typo in a chart's values -- reads as undefined, so a mislabelled
 * server lands in *Registered servers* instead of breaking the page.
 */
export function parseToolGroup(
  value: string | undefined,
): ToolGroup | undefined {
  return DECLARED_TOOL_GROUPS.find(group => group === value);
}

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

/**
 * AWS Signature Version 4 request signing (`spec.auth.sigv4`, muster#1082).
 *
 * A machine identity, not SSO: every request is signed as muster itself rather
 * than as the calling user, so the CRD rejects it alongside `forwardToken` and
 * `tokenExchange`, and only allows it with `spec.type: streamable-http`.
 */
export interface MCPServerSigV4 {
  /**
   * The signing region. Required, and it must match the region in `spec.url` —
   * the endpoint checks the signature's credential scope. This is NOT the
   * region the backend operates in; that one travels in `spec.meta`.
   */
  region: string;
  /**
   * The signing service name. Defaults to the first hostname label of
   * `spec.url` (`aws-mcp.eu-central-1.api.aws` signs as `aws-mcp`).
   */
  service?: string;
  /**
   * An IAM role assumed from muster's base credentials before signing. Empty
   * means muster signs as its own identity.
   */
  roleArn?: string;
}

export interface MCPServerAuth {
  type?: 'oauth' | 'none' | 'sigv4';
  forwardToken?: boolean;
  requiredAudiences?: string[];
  tokenExchange?: MCPServerTokenExchange;
  authorizationServer?: { issuer: string; scopes?: string };
  localMint?: { enabled?: boolean; audience?: string };
  /** Required when `type` is `sigv4`, and rejected otherwise. */
  sigv4?: MCPServerSigV4;
}

interface MCPServerInterface extends KubeObjectInterface {
  spec?: {
    type: 'stdio' | 'streamable-http' | 'sse';
    toolPrefix?: string;
    family?: MCPServerFamily;
    description?: string;
    autoStart?: boolean;
    suspended?: boolean;
    command?: string;
    url?: string;
    timeout?: number;
    auth?: MCPServerAuth;
    /**
     * Entries merged into `params._meta` of every outbound JSON-RPC request
     * that carries `params`. Provider-agnostic (it applies to plain
     * streamable-http and sse alike), but the motivating case is the
     * AWS-hosted server, which reads the region it OPERATES in from
     * `params._meta.AWS_REGION` — a different value from the sigv4 signing
     * region. Only allowed when `type` is not `stdio`.
     */
    meta?: Record<string, string>;
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

  /**
   * The tool group the shipping chart declared through
   * {@link TOOL_GROUP_LABEL}: `agent-platform` for the platform's own
   * managers, `infrastructure` for the servers of the management clusters
   * underneath it, undefined for a server without (or with an unknown) label
   * -- a *Registered server*. Orientation and preset membership, not
   * authorization.
   */
  getToolGroup(): ToolGroup | undefined {
    return parseToolGroup(this.findLabel(TOOL_GROUP_LABEL));
  }

  /**
   * The tool group this server is rendered under: its declared group, or
   * `registered` when it declares none.
   */
  getToolGroupKey(): ToolGroupKey {
    return this.getToolGroup() ?? 'registered';
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

  /**
   * Whether the server is deactivated (`spec.suspended`): muster's reconciler
   * keeps it disconnected until it is activated again (`core_service_start`
   * clears the flag; `core_service_stop` sets it). Level-based and durable,
   * unlike the transient `.status.state`.
   */
  getSuspended() {
    return this.jsonData.spec?.suspended ?? false;
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

  getMeta() {
    return this.jsonData.spec?.meta;
  }

  /**
   * Whether a 401 from this server is something a *user* can fix by signing in.
   *
   * Mirrors muster's `MCPServerAuth.CanAuthenticateInteractively`
   * (internal/api/mcpserver.go): a sigv4 server signs with muster's own machine
   * identity, so there is no login flow to send anyone to. muster classifies
   * its 401 as an ordinary connection failure (the state stays `Failed` and it
   * retries with backoff), and the UI must not offer a sign-in affordance that
   * could never help.
   */
  canAuthenticateInteractively() {
    return this.getAuth()?.type !== 'sigv4';
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

  /**
   * Prefix muster gives this server's *prompts*.
   *
   * Family grouping deduplicates tools across the family's members and so
   * feeds the tool prefix, but it does not apply to prompts: muster exposes
   * every prompt as `x_<toolPrefix-or-name>_<prompt>` regardless of family.
   * Reusing getToolNamePrefix here would fail to match for family servers that
   * also set a toolPrefix.
   */
  getPromptNamePrefix() {
    return `x_${this.jsonData.spec?.toolPrefix ?? this.getName()}`;
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

/**
 * Fraction of aggregated servers that must be unhealthy before the dashboard
 * "Servers healthy" stat flips to amber.
 *
 * muster federates ~26 management clusters, so at least one remote backend is
 * almost always degraded (goose/violet/garm DNS failures across trials).
 * Colouring the stat amber on `healthy != total` made it near-permanently amber
 * and therefore useless as a signal (dashboard review F1). Warn only when a
 * meaningful fraction is unhealthy so the colour means "act on this".
 *
 * ponytail: fixed 10% threshold (5/55 stays green, 6/55 warns). The orthogonal
 * scope question -- count the selected installation's own servers vs the full
 * federated fan-out -- is a deferred PM decision (iteration-2 ADR open
 * question #4), so the count still covers every aggregated server.
 */
export const SERVERS_HEALTH_WARNING_FRACTION = 0.1;

export interface ServersHealthSummary {
  healthy: number;
  total: number;
  tone: 'ok' | 'warning';
}

/**
 * Counts how many aggregated servers are healthy (severity `ok`, which includes
 * `Auth Required`) and decides the dashboard stat tone via
 * {@link SERVERS_HEALTH_WARNING_FRACTION}.
 */
export function serversHealthSummary(
  servers: Pick<MCPServer, 'getState'>[],
): ServersHealthSummary {
  const total = servers.length;
  const healthy = servers.filter(
    s => mcpServerStateSeverity(s.getState()) === 'ok',
  ).length;
  const unhealthyFraction = total === 0 ? 0 : (total - healthy) / total;
  return {
    healthy,
    total,
    tone:
      unhealthyFraction > SERVERS_HEALTH_WARNING_FRACTION ? 'warning' : 'ok',
  };
}
