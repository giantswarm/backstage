import {
  FIXTURE_INSTALLATION,
  FIXTURE_INSTALLATIONS,
  isFixtureInstallation,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  baseDataSet,
  inInstallation,
  type FixtureConnector,
  type FixtureExecution,
  type FixtureToolsetPreset,
  type FixtureWorkflow,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type {
  FixtureMcpServer,
  FixtureToolHandler,
} from '../fixtureToolHandlers';
import type {
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
  connectorNameOf,
  connectorPromptsOf,
  connectorResourcesOf,
  connectorToolsOf,
  executionOf,
  executionSummaryOf,
  FIXTURE_CORE_TOOLS,
  FIXTURE_MUSTER_NAMESPACE,
  isServing,
  mcpServerRuntimeOf,
  mcpToolLatencyOf,
  mcpUsageOf,
  musterInstallationOf,
  workflowListItemOf,
  workflowStatsOf,
  workflowToolOf,
} from './musterFixtureData';
import { presetsOf, resolveToolset } from './toolsetFixtures';

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

/** The installation a call targets, failing loudly for one not served. */
function served(installation: string | undefined): string {
  if (installation === undefined) {
    return FIXTURE_INSTALLATION;
  }
  if (!isFixtureInstallation(installation)) {
    const error = new FixtureInstallationUnknownError(installation);
    // eslint-disable-next-line no-console
    console.error(error.message);
    throw error;
  }
  return installation;
}

type Tool = {
  name: string;
  server: string;
  handler: FixtureToolHandler;
  inputSchema?: JsonSchema;
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

/** The data set's records of one installation that muster's reads serve. */
type InstallationData = {
  connectors: FixtureConnector[];
  workflows: FixtureWorkflow[];
  executions: FixtureExecution[];
  presets: FixtureToolsetPreset[];
  /** Every tool its connectors offer, serving or not: what usage counts. */
  connectorTools: ToolSummary[];
};

/**
 * The 503 muster-backend answers for an installation its probe reports
 * unreachable from the portal, as the real client throws it.
 */
function unreachableError(installation: string): Error {
  return Object.assign(
    new Error(
      `${installation} did not answer: not reachable from this portal (timeout)`,
    ),
    { name: 'ServiceUnavailableError', status: 503 },
  );
}

/** Whether the data set says the installation's muster is unreachable. */
function isUnreachable(installation: string): boolean {
  return baseDataSet().installations.some(
    i => i.name === installation && i.state === 'unreachable',
  );
}

/**
 * The muster plugin's API in fixture mode (`muster.fixtures: true`): the
 * installations of the base data set (`FIXTURE_INSTALLATIONS`), each with a
 * muster that has signed the person in. Each reachable installation's muster
 * aggregates the data set's connectors there, in their states, offers its
 * workflows and their executions, and knows its toolset presets; the
 * catalogue lists the tools, resources and prompts of the connectors that
 * serve this session, muster's own tools and the available workflows, and
 * resolves toolsets within it. Beside them, the MCP servers the plugins
 * contribute (`fixtureMcpServersDataRef`), each connected. An unreachable
 * installation's reads fail as muster-backend refuses them, with a 503, and
 * its background reads answer `unavailable`. `callTool` dispatches by tool
 * name (`x_<server>_<tool>`) to a contributed server's handler; a tool no
 * such server handles fails with {@link FixtureToolMissingError} and a
 * console error.
 */
export class MusterFixtureApi implements MusterApi {
  private readonly tools: Map<string, Tool>;
  private readonly servers: string[];
  private readonly data = new Map<string, InstallationData>();
  private readonly catalogues = new Map<string, ToolSummary[]>();

  constructor(servers: FixtureMcpServer[]) {
    this.servers = servers.map(server => server.server);
    this.tools = new Map(
      servers.flatMap(({ server, tools, inputSchemas }) =>
        Object.entries(tools).map(([tool, handler]) => {
          const name = `x_${server}_${tool}`;
          const inputSchema = inputSchemas?.[tool];
          return [name, { name, server, handler, inputSchema }] as const;
        }),
      ),
    );
  }

  /** An installation's records, worked out once: the data set is fixed. */
  private installationData(installation: string): InstallationData {
    let data = this.data.get(installation);
    if (!data) {
      const set = baseDataSet();
      const connectors = inInstallation(set.connectors, installation);
      data = {
        connectors,
        workflows: inInstallation(set.workflows, installation),
        executions: inInstallation(set.executions, installation),
        presets: inInstallation(set.toolsetPresets, installation),
        connectorTools: connectors.flatMap(connectorToolsOf),
      };
      this.data.set(installation, data);
    }
    return data;
  }

  /**
   * The installation a muster read targets: one fixture mode serves
   * ({@link served}) and whose muster the portal reaches, else the 503
   * muster-backend refuses the read with.
   */
  private reachable(installation: string | undefined): string {
    const target = served(installation);
    if (isUnreachable(target)) {
      throw unreachableError(target);
    }
    return target;
  }

  /**
   * The catalogue of an installation's muster, worked out once: what its
   * serving connectors and the contributed servers offer, then the available
   * workflows (muster lists no invalid one) and muster's own tools.
   */
  private catalogue(installation: string): ToolSummary[] {
    let catalogue = this.catalogues.get(installation);
    if (!catalogue) {
      const { connectors, workflows } = this.installationData(installation);
      catalogue = [
        ...connectors.filter(isServing).flatMap(connectorToolsOf),
        ...[...this.tools.values()].map(tool => ({
          name: tool.name,
          server: tool.server,
          kind: 'tool' as const,
          ...(tool.inputSchema && { inputSchema: tool.inputSchema }),
        })),
        ...workflows
          .filter(workflow => workflow.state === 'available')
          .map(workflow => workflowToolOf(workflow, connectors)),
        ...FIXTURE_CORE_TOOLS,
      ];
      this.catalogues.set(installation, catalogue);
    }
    return catalogue;
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>,
    installation: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const target = this.reachable(installation);
    const tool = this.tools.get(name);
    if (!tool) {
      const error = new FixtureToolMissingError(name);
      // eslint-disable-next-line no-console
      console.error(error.message, { args, installation });
      throw error;
    }
    return tool.handler(args, { installation: target, signal });
  }

  async listInstallations(): Promise<MusterInstallationsResponse> {
    return {
      installations: baseDataSet().installations.map(musterInstallationOf),
    };
  }

  /** muster-backend's `/workflows` reads the default installation's. */
  async listWorkflows(): Promise<WorkflowListResponse> {
    return {
      workflows: this.installationData(
        this.reachable(FIXTURE_INSTALLATION),
      ).workflows.map(workflowListItemOf),
    };
  }

  async listExecutions(
    options: ListExecutionsOptions = {},
  ): Promise<WorkflowExecutionListResponse> {
    const { executions, workflows, connectors } = this.installationData(
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
          connectors,
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
    const { executions, workflows, connectors } = this.installationData(
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
      connectors,
    );
  }

  async getWorkflowStats(
    name: string,
    installation?: string,
  ): Promise<WorkflowStats> {
    return workflowStatsOf(
      name,
      this.installationData(this.reachable(installation)).executions,
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
    return mcpUsageOf(this.installationData(installation).connectorTools, {
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
    return mcpToolLatencyOf(
      this.installationData(installation).connectorTools,
      {
        hours: options.hours ?? 24,
        servers: options.servers,
        now: Date.now(),
      },
    );
  }

  async listServers(installation?: string): Promise<McpServerListResponse> {
    const { connectors } = this.installationData(this.reachable(installation));
    return {
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
      servers: this.installationData(target).connectors.map(connectorNameOf),
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
    const { presets } = this.installationData(installation);
    const catalogue = this.catalogue(installation);
    const resolution = options.toolset
      ? resolveToolset(options.toolset, catalogue, presets)
      : undefined;
    const scope = resolution?.tools ?? catalogue;
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
    return {
      total: scope.length,
      filtered_count: all.length,
      truncated,
      tools: items,
      ...(options.toolset && {
        toolset: [...options.toolset],
        toolset_unmatched: resolution?.unmatched ?? [],
      }),
      ...((options.includePresets || options.toolset) && {
        presets: presetsOf(presets),
      }),
    };
  }

  async filterResources(
    options: FilterCapabilitiesOptions = {},
  ): Promise<FilterResourcesResponse> {
    const { connectors } = this.installationData(
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
    const { connectors } = this.installationData(
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
      servers_requiring_auth: this.installationData(target)
        .connectors.map(authStatusOf)
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

  async signIn(installation?: string): Promise<boolean> {
    served(installation);
    return true;
  }

  async authHeaders(installation?: string): Promise<Record<string, string>> {
    served(installation);
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
    const { connectors } = this.installationData(target);
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

  async signInServer(
    server: SignInTarget,
    installation?: string,
  ): Promise<ServerSignInResult> {
    this.reachable(installation);
    const name = typeof server === 'string' ? server : server.app;
    return { status: 'connected', message: `${name} is connected.` };
  }

  async signOutServer(
    server: SignInTarget,
    installation?: string,
  ): Promise<ServerSignOutResult> {
    this.reachable(installation);
    const name = typeof server === 'string' ? server : server.app;
    return { status: 'signed_out', message: `Signed out of ${name}.` };
  }
}
