import { FIXTURE_INSTALLATION } from '@giantswarm/backstage-plugin-gs-common';

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
      `Fixture mode serves no installation ${installation}, only ${FIXTURE_INSTALLATION}.`,
    );
    this.name = 'NotFoundError';
  }
}

/** The installation a call targets, failing loudly for one not served. */
function served(installation: string | undefined): string {
  if (installation !== undefined && installation !== FIXTURE_INSTALLATION) {
    const error = new FixtureInstallationUnknownError(installation);
    // eslint-disable-next-line no-console
    console.error(error.message);
    throw error;
  }
  return FIXTURE_INSTALLATION;
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

/**
 * The muster plugin's API in fixture mode (`muster.fixtures: true`): one
 * reachable installation, `meadow`, whose muster has signed the person in, and
 * the MCP servers the plugins contribute (`fixtureMcpServersDataRef`), each
 * connected. `callTool` dispatches by tool name (`x_<server>_<tool>`) to the
 * server's handler; a tool no server handles fails with
 * {@link FixtureToolMissingError} and a console error.
 *
 * The reads of muster itself (workflows, executions, usage, the other
 * servers) answer empty for now.
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

  private toolSummaries(pattern?: string, query?: string): ToolSummary[] {
    const needle = query?.toLowerCase();
    return [...this.tools.values()]
      .filter(tool => matchesPattern(tool.name, pattern))
      .filter(tool => !needle || tool.name.toLowerCase().includes(needle))
      .map(tool => ({ name: tool.name, server: tool.server }));
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
      installations: [
        {
          name: FIXTURE_INSTALLATION,
          endpoint: `https://muster.${FIXTURE_INSTALLATION}.example.com/mcp`,
          requiresAuth: true,
          reachable: true,
        },
      ],
    };
  }

  async listWorkflows(): Promise<WorkflowListResponse> {
    return { workflows: [] };
  }

  async listExecutions(
    options: ListExecutionsOptions = {},
  ): Promise<WorkflowExecutionListResponse> {
    served(options.installation);
    return {
      executions: [],
      total: 0,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      has_more: false,
    };
  }

  async getExecution(
    executionId: string,
    installation?: string,
  ): Promise<WorkflowExecution> {
    served(installation);
    const error = new Error(`No execution ${executionId} in fixture mode.`);
    error.name = 'NotFoundError';
    throw error;
  }

  async getWorkflowStats(
    name: string,
    installation?: string,
  ): Promise<WorkflowStats> {
    served(installation);
    return {
      workflow_name: name,
      runs: 0,
      sampled: 0,
      completed: 0,
      failed: 0,
      inprogress: 0,
      success_rate: null,
      avg_duration_ms: null,
      max_duration_ms: null,
      per_day: [],
    };
  }

  async getMcpUsage(
    options: { installation?: string; hours?: number } = {},
  ): Promise<McpUsage> {
    served(options.installation);
    return {
      available: true,
      range_hours: options.hours ?? 24,
      step_hours: 1,
      buckets: [],
      totals: {
        calls: 0,
        errors: 0,
        error_ratio: null,
        p95_seconds: null,
        distinct_tools: 0,
      },
      top_tools: [],
      servers: [],
    };
  }

  async getMcpToolLatency(
    options: { installation?: string; hours?: number } = {},
  ): Promise<McpToolLatency> {
    served(options.installation);
    return { available: true, range_hours: options.hours ?? 24, tools: [] };
  }

  async listServers(installation?: string): Promise<McpServerListResponse> {
    served(installation);
    return {
      mcpServers: this.servers.map(server => ({
        name: server,
        state: 'connected',
        sessionStatus: 'connected',
        toolsCount: [...this.tools.values()].filter(t => t.server === server)
          .length,
      })),
    };
  }

  async listConnectorNames(
    installation?: string,
  ): Promise<ConnectorNamesResponse> {
    served(installation);
    return { servers: [] };
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
    served(options.installation);
    const all = this.toolSummaries(options.pattern, options.query);
    const { items, truncated } = page(all, options);
    return {
      total: this.tools.size,
      filtered_count: all.length,
      truncated,
      tools: items,
    };
  }

  async filterResources(
    options: FilterCapabilitiesOptions = {},
  ): Promise<FilterResourcesResponse> {
    served(options.installation);
    return { total: 0, filtered_count: 0, truncated: false, resources: [] };
  }

  async filterPrompts(
    options: FilterCapabilitiesOptions = {},
  ): Promise<FilterPromptsResponse> {
    served(options.installation);
    return { total: 0, filtered_count: 0, truncated: false, prompts: [] };
  }

  async listTools(installation?: string): Promise<ListToolsResponse> {
    served(installation);
    return { tools: this.toolSummaries(), servers_requiring_auth: [] };
  }

  async listCoreTools(installation?: string): Promise<FilterToolsResponse> {
    served(installation);
    return { total: 0, filtered_count: 0, truncated: false, tools: [] };
  }

  async describeTool(name: string, installation?: string): Promise<ToolDetail> {
    served(installation);
    const tool = this.tools.get(name);
    if (!tool) {
      const error = new Error(`No tool ${name} in fixture mode.`);
      error.name = 'NotFoundError';
      throw error;
    }
    return { name: tool.name, server: tool.server };
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
    served(installation);
    return {
      servers: this.servers.map(name => ({ name, status: 'connected' })),
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
