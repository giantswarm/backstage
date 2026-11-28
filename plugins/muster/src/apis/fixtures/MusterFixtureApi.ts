import {
  FIXTURE_INSTALLATION,
  FIXTURE_INSTALLATIONS,
  isFixtureInstallation,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  fixtureDataSet,
  fixtureScenario,
  isUnreachableInstallation,
  unreachableInstallationError,
  withFixtureScenario,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type {
  FixtureMcpServer,
  FixtureToolHandler,
} from '../fixtureToolHandlers';
import { sessionExpiredError } from '../installationToken';
import { MusterUnauthorizedError } from '../musterUnauthorized';
import type {
  ApprovalDecisionResult,
  ApprovalLookup,
  AuthStatusResponse,
  ConnectorNamesResponse,
  FilterCapabilitiesOptions,
  FilterPromptsResponse,
  FilterResourcesResponse,
  FilterToolsOptions,
  FilterToolsResponse,
  JsonSchema,
  ListExecutionsOptions,
  ListToolsResponse,
  McpServerListResponse,
  McpToolLatency,
  McpUsage,
  MusterApi,
  MusterInstallationsResponse,
  MusterServerInfoResponse,
  MusterToolProgress,
  ServerSignInResult,
  ServerSignOutResult,
  SignInTarget,
  ToolDetail,
  ToolSummary,
  WorkflowExecution,
  WorkflowExecutionListResponse,
  WorkflowListResponse,
  WorkflowStats,
} from '../types';
import {
  authStatusOf,
  connectorKeyOf,
  connectorNameOf,
  connectorRefOf,
  connectorPromptsOf,
  connectorResourcesOf,
  executionOf,
  executionSummaryOf,
  FIXTURE_CORE_TOOLS,
  FIXTURE_MUSTER_NAMESPACE,
  isWorkflowAvailable,
  mcpServerRuntimeOf,
  mcpToolLatencyOf,
  mcpUsageOf,
  musterInstallationOf,
  workflowListItemOf,
  workflowStatsOf,
  workflowToolOf,
  type MusterFixtureConnector,
} from './musterFixtureData';
import { fixtureToolName } from './fixtureToolNames';
import {
  musterFixtureState,
  type MusterFixtureSnapshot,
} from './musterFixtureState';
import { musterCoreToolHandlers } from './musterCoreTools';
import { presetsOf, resolveToolset } from './toolsetFixtures';
import { reportForAgent } from './agentApprovalFixtures';

const coreToolHandlers = new Map(Object.entries(musterCoreToolHandlers));

/**
 * The error a tool call fails with when no fixture MCP server answers it. A
 * call fixture mode cannot answer must show, never read as an empty result:
 * add a handler for the tool (docs/fixtures.md).
 */
export class FixtureToolMissingError extends Error {
  constructor(tool: string) {
    super(
      `Fixture mode has no handler for the tool ${tool}: add one (docs/fixtures.md).`,
    );
    this.name = 'FixtureToolMissingError';
  }
}

/**
 * The error of a call for an installation fixture mode does not serve. Like
 * the fixture Kubernetes API's 404, so a page that targets the wrong
 * installation fails instead of showing the fixture installation's data.
 */
export class FixtureInstallationUnknownError extends Error {
  constructor(installation: string) {
    super(
      `Fixture mode serves no installation ${installation}, only ${FIXTURE_INSTALLATIONS.join(', ')}.`,
    );
    this.name = 'NotFoundError';
  }
}

/**
 * The installation whose person is signed out in the `error` scenario; the
 * other reachable ones answer muster-backend's 401.
 */
const SIGNED_OUT_INSTALLATION = FIXTURE_INSTALLATIONS[1];

/**
 * How muster fails a call to a reachable installation in the `error`
 * scenario: one has the person signed out (their portal session is gone),
 * the others answer muster-backend's 401 (the sign-in to the tool's server
 * for a tool call, a refused token for anything else). An unreachable one
 * fails as it always does.
 */
function scenarioError(installation: string, server?: string): Error {
  if (installation === SIGNED_OUT_INSTALLATION) {
    return sessionExpiredError(installation);
  }
  return server
    ? new MusterUnauthorizedError(
        `Sign in to ${server} to use its tools.`,
        'server_sign_in_required',
        server,
        installation,
      )
    : new MusterUnauthorizedError(
        `muster on ${installation} refused the token.`,
        'token_rejected',
        undefined,
        installation,
      );
}

/**
 * The provider Apps a server's answer asks the person to grant
 * (`status: "grant_required"`, `apps: [name]`), or none.
 */
function grantRequiredApps(answer: unknown): string[] {
  const { status, apps } = (answer ?? {}) as {
    status?: unknown;
    apps?: unknown;
  };
  if (status !== 'grant_required' || !Array.isArray(apps)) {
    return [];
  }
  return apps.filter(
    (app): app is string => typeof app === 'string' && app !== '',
  );
}

/**
 * muster's answer in place of a server's `grant_required`: its auth_required
 * tool error with a sign-in link per App (`structuredContent.apps`), as
 * muster-backend passes it on, a 401 naming the Apps.
 */
function providerAppGrantError(
  server: string,
  apps: string[],
  installation: string,
): MusterUnauthorizedError {
  return new MusterUnauthorizedError(
    `auth_required: server '${server}' requires authentication: it needs your grant of a provider App (${apps.join(
      ', ',
    )}) for this call.`,
    'server_sign_in_required',
    server,
    installation,
    'MusterUnauthorizedError',
    apps.map(app => ({
      app,
      authUrl: `https://muster.${installation}.fixtures.invalid/oauth/proxy/start?app=${app}`,
    })),
  );
}

/** Whether calls to a reachable installation fail, as in `error`. */
function failsInScenario(installation: string): boolean {
  return fixtureScenario() === 'error' && !isUnreachable(installation);
}

/** The installation a call targets, failing loudly for one not served. */
function known(installation: string | undefined): string {
  const target = installation ?? FIXTURE_INSTALLATION;
  if (!isFixtureInstallation(target)) {
    const error = new FixtureInstallationUnknownError(target);
    // eslint-disable-next-line no-console
    console.error(error.message);
    throw error;
  }
  return target;
}

/**
 * The installation a call to its muster targets ({@link known}), failing as
 * {@link scenarioError} says in the `error` scenario.
 */
function served(installation: string | undefined, server?: string): string {
  const target = known(installation);
  if (failsInScenario(target)) {
    throw scenarioError(target, server);
  }
  return target;
}

type Tool = {
  name: string;
  server: string;
  handler: FixtureToolHandler;
  inputSchema?: JsonSchema | ((installation: string) => JsonSchema);
  /** Whether an installation's release serves it; every one when absent. */
  servedOn?: (installation: string) => boolean;
};

/** `*` matches any run of characters, like muster's `filter_tools` pattern. */
function matchesPattern(name: string, pattern: string | undefined): boolean {
  if (!pattern) {
    return true;
  }
  const regex = new RegExp(
    `^${pattern
      .split('*')
      .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
    'i',
  );
  return regex.test(name);
}

function page<T>(items: T[], options: { limit?: number; offset?: number }) {
  const offset = options.offset ?? 0;
  const limited =
    options.limit === undefined
      ? items.slice(offset)
      : items.slice(offset, offset + options.limit);
  return { items: limited, truncated: offset + limited.length < items.length };
}

const unreachableError = unreachableInstallationError;

/** Whether the data set says the installation's muster is unreachable. */
function isUnreachable(installation: string): boolean {
  return isUnreachableInstallation(fixtureDataSet(), installation);
}

/**
 * The muster plugin's API in fixture mode (`muster.fixtures: true`): the
 * installations of the page's data set (`FIXTURE_INSTALLATIONS`), each with a
 * muster that has signed the person in. Each reachable installation's muster
 * serves what `musterFixtureState` holds for it: the data set's connectors
 * there, in their states and as the connector writes leave them, its
 * workflows (available while every tool their steps call is served), their
 * executions as they ran, and its toolset presets; the
 * catalogue lists the tools, resources and prompts of the connectors that
 * serve this session, muster's own tools and the available workflows, and
 * resolves toolsets within it. Beside them, the MCP servers the plugins
 * contribute (`fixtureMcpServersDataRef`), each connected. An unreachable
 * installation's reads fail as muster-backend refuses them, with a 503, and
 * its background reads answer `unavailable`. `callTool` dispatches by tool
 * name (`x_<server>_<tool>`) to a contributed server's handler, or to one of
 * muster's own tools it serves (`musterCoreToolHandlers`); any other tool
 * fails with {@link FixtureToolMissingError} and a console error.
 */
export class MusterFixtureApi implements MusterApi {
  private readonly tools: Map<string, Tool>;
  private readonly servers: string[];
  private readonly catalogues = new WeakMap<
    MusterFixtureSnapshot,
    ToolSummary[]
  >();

  constructor(servers: FixtureMcpServer[]) {
    this.servers = servers.map(server => server.server);
    this.tools = new Map(
      servers.flatMap(({ server, tools, inputSchemas, unservedTools }) =>
        Object.entries(tools).map(([tool, handler]) => {
          const name = fixtureToolName(server, tool);
          const inputSchema = inputSchemas?.[tool];
          const servedOn = unservedTools
            ? (installation: string) =>
                !unservedTools(installation).includes(tool)
            : undefined;
          return [
            name,
            { name, server, handler, inputSchema, servedOn },
          ] as const;
        }),
      ),
    );
  }

  /**
   * The installation a muster read targets: one fixture mode serves
   * ({@link served}) and whose muster the portal reaches, else the 503
   * muster-backend refuses the read with.
   */
  private reachable(installation: string | undefined, server?: string): string {
    const target = served(installation, server);
    if (isUnreachable(target)) {
      throw unreachableError(target);
    }
    return target;
  }

  /**
   * What the installation's muster serves now, as the writes leave it, from
   * the page's scenario's data set.
   */
  private snapshot(installation: string): MusterFixtureSnapshot {
    return musterFixtureState().snapshotOf(installation);
  }

  /**
   * The catalogue of an installation's muster, worked out again only when
   * what it serves changed: what its serving connectors and the contributed
   * servers offer, then the available workflows (muster lists no invalid one)
   * and muster's own tools.
   */
  private catalogue(installation: string): ToolSummary[] {
    const snapshot = this.snapshot(installation);
    let catalogue = this.catalogues.get(snapshot);
    if (!catalogue) {
      const { served: servedTools, workflows } = snapshot;
      catalogue = [
        ...servedTools.values(),
        ...[...this.tools.values()]
          .filter(tool => tool.servedOn?.(installation) ?? true)
          .map(tool => ({
            name: tool.name,
            server: tool.server,
            kind: 'tool' as const,
            ...(tool.inputSchema && {
              inputSchema:
                typeof tool.inputSchema === 'function'
                  ? tool.inputSchema(installation)
                  : tool.inputSchema,
            }),
          })),
        ...workflows
          .filter(workflow => isWorkflowAvailable(workflow, servedTools))
          .map(workflow => workflowToolOf(workflow, servedTools)),
        ...FIXTURE_CORE_TOOLS,
      ];
      this.catalogues.set(snapshot, catalogue);
    }
    return catalogue;
  }

  /** The installation's connectors now, as the connector writes leave them. */
  private liveConnectors(installation: string): MusterFixtureConnector[] {
    return this.snapshot(installation).connectors;
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>,
    installation: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const registered = this.tools.get(name);
    const target = this.reachable(installation, registered?.server ?? 'muster');
    // A release that does not serve the tool answers as muster does.
    const tool =
      registered?.servedOn?.(target) === false ? undefined : registered;
    if (registered && !tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    const handler = tool?.handler ?? coreToolHandlers.get(name);
    if (!handler) {
      const error = new FixtureToolMissingError(name);
      // eslint-disable-next-line no-console
      console.error(error.message, { args, installation });
      throw error;
    }
    const answer = await handler(args, { installation: target, signal });
    // muster answers a server's grant_required with its own error, naming
    // the Apps; it never passes the answer on.
    const apps = tool ? grantRequiredApps(answer) : [];
    if (tool && apps.length > 0) {
      throw providerAppGrantError(tool.server, apps, target);
    }
    return answer;
  }

  /**
   * muster-backend's list of the installations it is configured for, not a
   * call to any muster: it answers in the `error` scenario too, so the pages
   * go on to the musters and show how those fail.
   */
  async listInstallations(): Promise<MusterInstallationsResponse> {
    return {
      installations: fixtureDataSet().installations.map(musterInstallationOf),
    };
  }

  /** muster-backend's `/workflows` reads the default installation's. */
  async listWorkflows(): Promise<WorkflowListResponse> {
    const { workflows, served: servedTools } = this.snapshot(
      this.reachable(FIXTURE_INSTALLATION),
    );
    return {
      workflows: workflows.map(workflow =>
        workflowListItemOf(workflow, servedTools),
      ),
    };
  }

  async listExecutions(
    options: ListExecutionsOptions = {},
  ): Promise<WorkflowExecutionListResponse> {
    const { executions, workflows, recorded } = this.snapshot(
      this.reachable(options.installation),
    );
    const matching = executions
      .filter(
        execution =>
          (!options.workflowName ||
            execution.workflow === options.workflowName) &&
          (!options.status || execution.state === options.status),
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    return {
      executions: matching.slice(offset, offset + limit).map(execution =>
        executionSummaryOf(
          execution,
          workflows.find(w => w.name === execution.workflow),
          recorded,
        ),
      ),
      total: matching.length,
      limit,
      offset,
      has_more: offset + limit < matching.length,
    };
  }

  async getExecution(
    executionId: string,
    installation?: string,
  ): Promise<WorkflowExecution> {
    const { executions, workflows, recorded } = this.snapshot(
      this.reachable(installation),
    );
    const execution = executions.find(e => e.id === executionId);
    if (!execution) {
      const error = new Error(`No execution ${executionId} in fixture mode.`);
      error.name = 'NotFoundError';
      throw error;
    }
    return executionOf(
      execution,
      workflows.find(workflow => workflow.name === execution.workflow),
      recorded,
    );
  }

  async getWorkflowStats(
    name: string,
    installation?: string,
  ): Promise<WorkflowStats> {
    return workflowStatsOf(
      name,
      this.snapshot(this.reachable(installation)).executions,
    );
  }

  async getMcpUsage(
    options: {
      installation?: string;
      hours?: number;
      servers?: readonly string[];
      tool?: string;
    } = {},
  ): Promise<McpUsage> {
    const installation = this.reachable(options.installation);
    return mcpUsageOf(this.snapshot(installation).connectorTools, {
      hours: options.hours ?? 24,
      servers: options.servers,
      tool: options.tool,
      now: Date.now(),
    });
  }

  async getMcpToolLatency(
    options: {
      installation?: string;
      hours?: number;
      servers?: readonly string[];
    } = {},
  ): Promise<McpToolLatency> {
    const installation = this.reachable(options.installation);
    return mcpToolLatencyOf(this.snapshot(installation).connectorTools, {
      hours: options.hours ?? 24,
      servers: options.servers,
      now: Date.now(),
    });
  }

  async listServers(installation?: string): Promise<McpServerListResponse> {
    const target = this.reachable(installation);
    const connectors = this.liveConnectors(target);
    return {
      // As muster reports it beside the servers (tool approval).
      governance: musterFixtureState().governanceOf(target),
      mcpServers: [
        ...connectors.map(mcpServerRuntimeOf),
        ...this.servers.map(server => ({
          name: server,
          namespace: FIXTURE_MUSTER_NAMESPACE,
          state: 'Connected',
          sessionStatus: 'connected',
          toolsCount: [...this.tools.values()].filter(t => t.server === server)
            .length,
        })),
      ],
    };
  }

  /** A background read: an unreachable muster answers `unavailable`. */
  async listConnectorNames(
    installation?: string,
  ): Promise<ConnectorNamesResponse> {
    const target = served(installation);
    if (isUnreachable(target)) {
      return { servers: [], unavailable: true };
    }
    return {
      servers: this.liveConnectors(target).map(connectorNameOf),
    };
  }

  /** A background read: an unreachable muster answers `unavailable`. */
  async getServerInfo(
    installation?: string,
  ): Promise<MusterServerInfoResponse> {
    return isUnreachable(served(installation)) ? { unavailable: true } : {};
  }

  async filterTools(
    options: FilterToolsOptions = {},
  ): Promise<FilterToolsResponse> {
    const installation = this.reachable(options.installation);
    const { presets } = this.snapshot(installation);
    const catalogue = this.catalogue(installation);
    if (options.toolset && options.agentTools) {
      throw Object.assign(
        new Error(
          "pass toolset or agentTools, not both: agentTools.tools is the agent's toolset",
        ),
        { status: 422 },
      );
    }
    // An agent's tool list narrows like a toolset and reports its approvals.
    const selectors = options.agentTools
      ? options.agentTools.tools.map(item =>
          typeof item === 'string' ? item : Object.keys(item)[0],
        )
      : options.toolset;
    const resolution = selectors
      ? resolveToolset(selectors, catalogue, presets)
      : undefined;
    const scope = options.agentTools
      ? this.agentReport(installation, catalogue, options.agentTools)
      : (resolution?.tools ?? catalogue);
    const needle = options.query?.toLowerCase();
    const all = scope
      .filter(tool => matchesPattern(tool.name, options.pattern))
      .filter(
        tool =>
          !needle ||
          tool.name.toLowerCase().includes(needle) ||
          tool.description?.toLowerCase().includes(needle),
      )
      .map(tool =>
        options.includeSchema
          ? tool
          : { ...tool, description: undefined, inputSchema: undefined },
      );
    const { items, truncated } = page(all, options);
    // muster's `total` counts the matches, like `filtered_count`; the whole
    // catalogue is its `total_tools`, which the portal does not read.
    return {
      total: all.length,
      filtered_count: all.length,
      truncated,
      tools: items,
      ...(options.agentTools && {
        agentTools: {
          entries: [...options.agentTools.tools],
          settings: options.agentTools.tools.filter(
            item => typeof item !== 'string',
          ),
        },
      }),
      ...(selectors && {
        toolset: [...selectors],
        toolset_unmatched: resolution?.unmatched ?? [],
      }),
      ...((options.includePresets || selectors) && {
        presets: presetsOf(presets),
      }),
    };
  }

  /**
   * The catalogue as an agent's tool list sees it (`agentTools`): muster's
   * agent approvals and, per connector tool, the MCPServer behind it.
   */
  private agentReport(
    installation: string,
    catalogue: ToolSummary[],
    agentTools: NonNullable<FilterToolsOptions['agentTools']>,
  ): ToolSummary[] {
    const connectors = new Map(
      this.liveConnectors(installation).map(connector => [
        connectorKeyOf(connector),
        connector,
      ]),
    );
    return reportForAgent(
      catalogue,
      agentTools,
      this.snapshot(installation).presets,
      tool => {
        const connector = tool.server ? connectors.get(tool.server) : undefined;
        return connector ? [connectorRefOf(connector, tool)] : undefined;
      },
    );
  }

  async filterResources(
    options: FilterCapabilitiesOptions = {},
  ): Promise<FilterResourcesResponse> {
    const connectors = this.liveConnectors(
      this.reachable(options.installation),
    );
    // `server` scopes the list, `total` included; `pattern` filters it.
    const resources = connectors
      .flatMap(connectorResourcesOf)
      .filter(
        resource => !options.server || resource.server === options.server,
      );
    const all = resources.filter(resource =>
      matchesPattern(resource.uri, options.pattern),
    );
    const { items, truncated } = page(all, options);
    return {
      total: resources.length,
      filtered_count: all.length,
      truncated,
      resources: items,
    };
  }

  async filterPrompts(
    options: FilterCapabilitiesOptions = {},
  ): Promise<FilterPromptsResponse> {
    const connectors = this.liveConnectors(
      this.reachable(options.installation),
    );
    const prompts = connectors
      .flatMap(connectorPromptsOf)
      .filter(prompt => !options.server || prompt.server === options.server);
    const all = prompts.filter(prompt =>
      matchesPattern(prompt.name, options.pattern),
    );
    const { items, truncated } = page(all, options);
    return {
      total: prompts.length,
      filtered_count: all.length,
      truncated,
      prompts: items,
    };
  }

  async listTools(installation?: string): Promise<ListToolsResponse> {
    const target = this.reachable(installation);
    return {
      tools: this.catalogue(target).map(({ name, server, kind }) => ({
        name,
        server,
        kind,
      })),
      servers_requiring_auth: this.liveConnectors(target)
        .map(authStatusOf)
        .filter(status => status.status === 'auth_required')
        .map(status => ({
          name: status.name,
          status: status.status,
          auth_tool: status.auth_tool ?? 'core_auth_login',
        })),
    };
  }

  async listCoreTools(installation?: string): Promise<FilterToolsResponse> {
    this.reachable(installation);
    return {
      total: FIXTURE_CORE_TOOLS.length,
      filtered_count: FIXTURE_CORE_TOOLS.length,
      truncated: false,
      tools: [...FIXTURE_CORE_TOOLS],
    };
  }

  async describeTool(name: string, installation?: string): Promise<ToolDetail> {
    const tool = this.catalogue(this.reachable(installation)).find(
      t => t.name === name,
    );
    if (!tool) {
      const error = new Error(`No tool ${name} in fixture mode.`);
      error.name = 'NotFoundError';
      throw error;
    }
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      server: tool.server,
      kind: tool.kind,
      annotations: tool.annotations,
    };
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    installation?: string,
    options?: { signal?: AbortSignal; urlElicitation?: boolean },
  ): Promise<unknown> {
    return this.dispatch(name, args, installation, options?.signal);
  }

  async callToolWithProgress(
    name: string,
    args: Record<string, unknown>,
    options: {
      installation?: string;
      onProgress: (progress: MusterToolProgress) => void;
      signal?: AbortSignal;
      urlElicitation?: boolean;
    },
  ): Promise<unknown> {
    return this.dispatch(name, args, options.installation, options.signal);
  }

  /**
   * Reports, never throws, as the real client does: no sign-in succeeds in
   * the `error` scenario.
   */
  async signIn(installation?: string): Promise<boolean> {
    return !failsInScenario(known(installation));
  }

  /**
   * Only resolves the person's token, never calls muster: in the `error`
   * scenario it fails only where the person is signed out.
   */
  async authHeaders(installation?: string): Promise<Record<string, string>> {
    const target = known(installation);
    if (failsInScenario(target) && target === SIGNED_OUT_INSTALLATION) {
      throw sessionExpiredError(target);
    }
    return {};
  }

  /**
   * A background read: an unreachable muster answers `unavailable`, as
   * muster-backend's `/auth/status` does.
   */
  async getAuthStatus(installation?: string): Promise<AuthStatusResponse> {
    const target = served(installation);
    if (isUnreachable(target)) {
      return {
        servers: [],
        unavailable: true,
        message: unreachableError(target).message,
      };
    }
    const connectors = this.liveConnectors(target);
    return {
      servers: [
        ...connectors.map(authStatusOf),
        ...this.servers.map(name => ({
          name,
          status: 'connected' as const,
        })),
      ],
    };
  }

  /**
   * Signs the person in to a connector: one waiting on their sign-in
   * connects (`musterFixtureState`).
   */
  async signInServer(
    server: SignInTarget,
    installation?: string,
  ): Promise<ServerSignInResult> {
    const target = this.reachable(installation);
    const name = typeof server === 'string' ? server : server.app;
    musterFixtureState().signIn(target, name);
    return { status: 'connected', message: `${name} is connected.` };
  }

  async signOutServer(
    server: SignInTarget,
    installation?: string,
  ): Promise<ServerSignOutResult> {
    const target = this.reachable(installation);
    const name = typeof server === 'string' ? server : server.app;
    musterFixtureState().signOut(target, name);
    return { status: 'signed_out', message: `Signed out of ${name}.` };
  }

  /** The fixture muster issues no sign-in handoff: links open as they are. */
  async requestHandoff(): Promise<string | undefined> {
    return undefined;
  }

  /** Decisions taken on the fixture approvals, by link, for this page load. */
  private readonly approvalDecisions = new Map<
    string,
    'approved' | 'declined'
  >();

  /**
   * Every approval link shows the same made-up request, pending until it is
   * decided here.
   */
  async getApproval(url: string): Promise<ApprovalLookup> {
    const id = url.split('/').pop() ?? 'fixture';
    return {
      view: {
        id,
        status: this.approvalDecisions.get(url) ?? 'pending',
        heading: 'Approve this action?',
        message: 'An agent wants to run Merge pull request in GitHub.',
        tool: {
          title: 'Merge pull request',
          name: 'merge_pull_request',
          exposed: 'x_github_merge_pull_request',
          kind: 'tool',
        },
        connector: { displayName: 'GitHub', server: 'github' },
        changesData: true,
        arguments: [
          {
            key: 'owner',
            label: 'Owner',
            value: '"giantswarm"',
            type: 'string',
          },
          { key: 'pr', label: 'Pr', value: '42', type: 'number' },
        ],
        agentSays: 'The checks are green, merging as you asked.',
        why: { setting: 'ask', source: 'connector' },
        actsFor: {
          name: 'guest@example.com',
          subject: 'guest',
          issuer: 'https://dex.example.com',
        },
        callerKind: 'actor JWT',
        session: 'a1b2c3d4…',
        client: 'agent-platform',
        canonicalArguments: '{"owner":"giantswarm","pr":42}',
        argumentsHash: '0'.repeat(64),
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        digest: `fixture-${id}`,
      },
    };
  }

  async decideApproval(
    url: string,
    decision: 'approve' | 'decline',
  ): Promise<ApprovalDecisionResult> {
    const decided = this.approvalDecisions.get(url);
    if (decided) {
      return {
        refusal: {
          status: 409,
          error: 'decided',
          decided,
          message: `This request was already ${decided}; this answer changes nothing.`,
        },
      };
    }
    const status = decision === 'approve' ? 'approved' : 'declined';
    this.approvalDecisions.set(url, status);
    return { status };
  }
}

/**
 * The fixture `MusterApi`, as the page's fixture scenario serves it. In
 * `error` it fails in muster's own words ({@link scenarioError}).
 */
export function musterFixtureApi(servers: FixtureMcpServer[]): MusterApi {
  return withFixtureScenario(
    'MusterApi',
    new MusterFixtureApi(servers),
    () => undefined,
  );
}
