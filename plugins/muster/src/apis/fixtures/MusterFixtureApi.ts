import {
  FIXTURE_INSTALLATION,
  FIXTURE_INSTALLATIONS,
  isFixtureInstallation,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  baseDataSet,
  inInstallation,
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
  stepsRunOf,
  workflowListItemOf,
  workflowStatsOf,
  workflowToolOf,
} from './musterFixtureData';

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
function installationData(installation: string) {
  const data = baseDataSet();
  return {
    connectors: inInstallation(data.connectors, installation),
    workflows: inInstallation(data.workflows, installation),
    executions: inInstallation(data.executions, installation),
  };
}

/**
 * The muster plugin's API in fixture mode (`muster.fixtures: true`): the
 * installations of the base data set (`FIXTURE_INSTALLATIONS`), each with a
 * muster that has signed the person in, reachable or not as the data set
 * says. Each installation's muster aggregates the data set's connectors there,
 * in their states, and offers its workflows and their executions; the
 * catalogue lists the tools, resources and prompts of the connectors that
 * serve this session, muster's own tools and the workflows. Beside them, the
 * MCP servers the plugins contribute (`fixtureMcpServersDataRef`), each
 * connected. `callTool` dispatches by tool name (`x_<server>_<tool>`) to a
 * contributed server's handler; a tool no such server handles fails with
 * {@link FixtureToolMissingError} and a console error.
 */
export class MusterFixtureApi implements MusterApi {
  private readonly tools: Map<string, Tool>;
  private readonly servers: string[];

  constructor(servers: FixtureMcpServer[]) {
    this.servers = servers.map(server => server.server);
    this.tools = new Map(
      servers.flatMap(({ server, tools }) =>
        Object.entries(tools).map(([tool, handler]) => {
          const name = `x_${server}_${tool}`;
          return [name, { name, server, handler }] as const;
        }),
      ),
    );
  }

  /** The contributed servers' tools, as the catalogue lists them. */
  private contributedTools(): ToolSummary[] {
    return [...this.tools.values()].map(tool => ({
      name: tool.name,
      server: tool.server,
      kind: 'tool',
    }));
  }

  /**
   * The catalogue of an installation's muster: what its serving connectors
   * and the contributed servers offer, then the workflows and muster's own
   * tools.
   */
  private catalogue(installation: string): ToolSummary[] {
    const { connectors, workflows } = installationData(installation);
    return [
      ...connectors.filter(isServing).flatMap(connectorToolsOf),
      ...this.contributedTools(),
      ...workflows.map(workflow =>
        workflowToolOf(workflow, baseDataSet().connectors),
      ),
      ...FIXTURE_CORE_TOOLS,
    ];
  }

  /** Every tool an installation's connectors were ever called with. */
  private usedTools(installation: string): ToolSummary[] {
    return installationData(installation).connectors.flatMap(connectorToolsOf);
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>,
    installation: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const target = served(installation);
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
      workflows:
        installationData(FIXTURE_INSTALLATION).workflows.map(
          workflowListItemOf,
        ),
    };
  }

  async listExecutions(
    options: ListExecutionsOptions = {},
  ): Promise<WorkflowExecutionListResponse> {
    const { executions, workflows } = installationData(
      served(options.installation),
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
          stepsRunOf(
            execution,
            workflows.find(w => w.name === execution.workflow),
            baseDataSet().connectors,
          ),
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
    const { executions, workflows } = installationData(served(installation));
    const execution = executions.find(e => e.id === executionId);
    if (!execution) {
      const error = new Error(`No execution ${executionId} in fixture mode.`);
      error.name = 'NotFoundError';
      throw error;
    }
    return executionOf(
      execution,
      workflows.find(workflow => workflow.name === execution.workflow),
      baseDataSet().connectors,
    );
  }

  async getWorkflowStats(
    name: string,
    installation?: string,
  ): Promise<WorkflowStats> {
    return workflowStatsOf(
      name,
      installationData(served(installation)).executions,
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
    const installation = served(options.installation);
    return mcpUsageOf(this.usedTools(installation), {
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
    const installation = served(options.installation);
    return mcpToolLatencyOf(this.usedTools(installation), {
      hours: options.hours ?? 24,
      servers: options.servers,
      now: Date.now(),
    });
  }

  async listServers(installation?: string): Promise<McpServerListResponse> {
    const { connectors } = installationData(served(installation));
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

  async listConnectorNames(
    installation?: string,
  ): Promise<ConnectorNamesResponse> {
    const { connectors } = installationData(served(installation));
    return { servers: connectors.map(connectorNameOf) };
  }

  async getServerInfo(
    installation?: string,
  ): Promise<MusterServerInfoResponse> {
    served(installation);
    return {};
  }

  async filterTools(
    options: FilterToolsOptions = {},
  ): Promise<FilterToolsResponse> {
    const installation = served(options.installation);
    const catalogue = this.catalogue(installation);
    const needle = options.query?.toLowerCase();
    const all = catalogue
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
      total: catalogue.length,
      filtered_count: all.length,
      truncated,
      tools: items,
    };
  }

  async filterResources(
    options: FilterCapabilitiesOptions = {},
  ): Promise<FilterResourcesResponse> {
    const { connectors } = installationData(served(options.installation));
    const resources = connectors.flatMap(connectorResourcesOf);
    const all = resources.filter(
      resource =>
        (!options.server || resource.server === options.server) &&
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
    const { connectors } = installationData(served(options.installation));
    const prompts = connectors.flatMap(connectorPromptsOf);
    const all = prompts.filter(
      prompt =>
        (!options.server || prompt.server === options.server) &&
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
    const target = served(installation);
    return {
      tools: this.catalogue(target).map(({ name, server, kind }) => ({
        name,
        server,
        kind,
      })),
      servers_requiring_auth: installationData(target)
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
    served(installation);
    return {
      total: FIXTURE_CORE_TOOLS.length,
      filtered_count: FIXTURE_CORE_TOOLS.length,
      truncated: false,
      tools: [...FIXTURE_CORE_TOOLS],
    };
  }

  async describeTool(name: string, installation?: string): Promise<ToolDetail> {
    const tool = this.catalogue(served(installation)).find(
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

  async getAuthStatus(installation?: string): Promise<AuthStatusResponse> {
    const { connectors } = installationData(served(installation));
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
    served(installation);
    const name = typeof server === 'string' ? server : server.app;
    return { status: 'connected', message: `${name} is connected.` };
  }

  async signOutServer(
    server: SignInTarget,
    installation?: string,
  ): Promise<ServerSignOutResult> {
    served(installation);
    const name = typeof server === 'string' ? server : server.app;
    return { status: 'signed_out', message: `Signed out of ${name}.` };
  }
}
