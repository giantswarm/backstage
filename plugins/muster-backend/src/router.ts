import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AuthenticationError,
  InputError,
  ServiceUnavailableError,
} from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import {
  MusterInstallationConfig,
  MusterMcpClient,
  readMusterInstallationsFromConfig,
} from './MusterMcpClient';

const EXECUTION_STATUSES = ['inprogress', 'completed', 'failed'] as const;

/**
 * Header the muster frontend uses to forward the user's OAuth token for the
 * target installation's `authProvider`. Mirrors ai-chat's
 * `backstage-ai-chat-authorization-<provider>` scheme; the proxy talks to one
 * installation per request, so no provider suffix is needed.
 */
export const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  /** Overridable for tests; used as the client for every installation. */
  client?: MusterMcpClient;
}

function parseOptionalInt(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InputError(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function singleQueryValue(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InputError(`${name} must be provided at most once`);
  }
  return value;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config } = options;

  const installations = readMusterInstallationsFromConfig(config, logger);

  // Map each installation to a client. When a client is injected (tests),
  // reuse it for every installation; synthesize a default installation if
  // none is configured so routing still resolves.
  const clients = new Map<string, MusterMcpClient>();
  if (options.client) {
    if (installations.size === 0) {
      installations.set('muster', {
        name: 'muster',
        url: 'injected',
      });
    }
    for (const name of installations.keys()) {
      clients.set(name, options.client);
    }
  } else {
    for (const [name, installation] of installations) {
      clients.set(name, new MusterMcpClient(installation, logger));
      logger.info(
        `Muster proxy installation '${name}' connected to ${installation.url}${
          installation.authProvider
            ? ` (per-user auth via provider '${installation.authProvider}')`
            : ''
        }`,
      );
    }
  }

  if (installations.size === 0) {
    logger.info(
      'No muster installations configured (set muster.installations, or an aiChat.mcp entry named per muster.serverName, default "muster"); muster endpoints will return 503.',
    );
  }

  const router = Router();
  router.use(express.json());

  router.get('/health', (_, res) => {
    res.json({ status: 'ok', configured: clients.size > 0 });
  });

  router.get('/installations', (_, res) => {
    res.json({
      installations: [...installations.values()].map(installation => ({
        name: installation.name,
        // The aggregator endpoint (mono-rendered on the dashboard identity
        // card). Per-MC domain isn't derivable from the name, so it comes from
        // config rather than being fabricated frontend-side.
        endpoint: installation.url,
        requiresAuth: Boolean(installation.authProvider),
      })),
    });
  });

  /**
   * Resolve the target installation for a request from `?installation=`.
   * Defaults to the only installation when exactly one is configured;
   * otherwise the parameter is required.
   */
  const resolveInstallation = (
    req: express.Request,
  ): { config: MusterInstallationConfig; client: MusterMcpClient } => {
    if (clients.size === 0) {
      throw new ServiceUnavailableError(
        'No muster installation is configured. Set muster.installations, or add an entry named "muster" to aiChat.mcp.',
      );
    }

    const requested = singleQueryValue(req.query.installation, 'installation');
    let name = requested;
    if (!name) {
      if (clients.size > 1) {
        throw new InputError(
          `installation query parameter is required; configured installations: ${[
            ...clients.keys(),
          ].join(', ')}`,
        );
      }
      name = [...clients.keys()][0];
    }

    const client = clients.get(name);
    const installationConfig = installations.get(name);
    if (!client || !installationConfig) {
      throw new InputError(
        `Unknown muster installation '${name}'; configured installations: ${[
          ...clients.keys(),
        ].join(', ')}`,
      );
    }
    return { config: installationConfig, client };
  };

  /**
   * When the target installation requires per-user auth, the frontend must
   * forward the user's token; without it the muster server would reject the
   * connection anyway, so fail fast with a 401 the frontend can act on.
   */
  const readCallOptions = (
    req: express.Request,
    installation: MusterInstallationConfig,
  ): { authToken?: string } => {
    if (!installation.authProvider) {
      return {};
    }
    const headerValue = req.headers[MUSTER_AUTH_HEADER];
    const authToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!authToken) {
      throw new AuthenticationError(
        `The muster installation '${installation.name}' requires a user token for auth provider '${installation.authProvider}', but the request did not include one.`,
      );
    }
    return { authToken };
  };

  // --- Tool discovery / execution (meta-tools) -----------------------------

  router.get('/tools', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const result = await client.listTools(readCallOptions(req, installation));
    res.json(result);
  });

  router.get('/tools/filter', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const args: Record<string, unknown> = {};

    const pattern = singleQueryValue(req.query.pattern, 'pattern');
    if (pattern !== undefined) {
      args.pattern = pattern;
    }
    const query = singleQueryValue(req.query.query, 'query');
    if (query !== undefined) {
      args.query = query;
    }
    const descriptionFilter = singleQueryValue(
      req.query.description_filter,
      'description_filter',
    );
    if (descriptionFilter !== undefined) {
      args.description_filter = descriptionFilter;
    }
    const includeSchema = singleQueryValue(
      req.query.include_schema,
      'include_schema',
    );
    if (includeSchema !== undefined) {
      args.include_schema = includeSchema === 'true';
    }
    const limit = parseOptionalInt(req.query.limit, 'limit');
    if (limit !== undefined) {
      args.limit = limit;
    }
    const offset = parseOptionalInt(req.query.offset, 'offset');
    if (offset !== undefined) {
      args.offset = offset;
    }

    const result = await client.filterTools(
      args,
      readCallOptions(req, installation),
    );
    res.json(result);
  });

  router.get('/tools/:name', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const result = await client.describeTool(
      req.params.name,
      readCallOptions(req, installation),
    );
    res.json(result);
  });

  router.get('/core-tools', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const args: Record<string, unknown> = {};
    const includeSchema = singleQueryValue(
      req.query.include_schema,
      'include_schema',
    );
    if (includeSchema !== undefined) {
      args.include_schema = includeSchema === 'true';
    }
    const result = await client.listCoreTools(
      args,
      readCallOptions(req, installation),
    );
    res.json(result);
  });

  /**
   * Execute an aggregated tool. The UI executes whatever tools muster exposes;
   * the trust boundary is the downstream MCP server's deployment (e.g.
   * mcp-kubernetes is deployed read-only), not this proxy.
   */
  router.post('/call', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const { name, arguments: toolArgs } = req.body ?? {};

    if (typeof name !== 'string' || name === '') {
      throw new InputError('name is required in the request body');
    }
    if (
      toolArgs !== undefined &&
      (typeof toolArgs !== 'object' ||
        toolArgs === null ||
        Array.isArray(toolArgs))
    ) {
      throw new InputError('arguments must be a JSON object when provided');
    }

    const result = await client.callTool(
      name,
      (toolArgs as Record<string, unknown>) ?? {},
      readCallOptions(req, installation),
    );
    res.json(result);
  });

  // --- MCP servers (runtime view via core_mcpserver_list) ------------------

  router.get('/servers', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const result = await client.callTool(
      'core_mcpserver_list',
      {},
      readCallOptions(req, installation),
    );
    res.json(result);
  });

  // --- Workflows -----------------------------------------------------------

  router.get('/workflows', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const result = await client.callTool(
      'core_workflow_list',
      {},
      readCallOptions(req, installation),
    );
    res.json(result);
  });

  router.get('/workflows/:name', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const result = await client.callTool(
      'core_workflow_get',
      { name: req.params.name },
      readCallOptions(req, installation),
    );
    res.json(result);
  });

  /**
   * Derived run statistics for a workflow. muster exposes no stats tool, so
   * aggregate over a bounded sample of executions. ponytail: single page (cap
   * `limit`) — `runs` is the authoritative total from muster, but rates and
   * durations are computed over the sampled page only. Upgrade path: page
   * until has_more is false, or a dedicated muster stats tool.
   */
  router.get('/workflows/:name/stats', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const callOptions = readCallOptions(req, installation);

    const sampleLimit = parseOptionalInt(req.query.limit, 'limit') ?? 200;
    const listed = (await client.callTool(
      'core_workflow_execution_list',
      { workflow_name: req.params.name, limit: sampleLimit, offset: 0 },
      callOptions,
    )) as {
      executions?: Array<{
        status?: string;
        duration_ms?: number;
        started_at?: string;
      }> | null;
      total?: number;
    } | null;

    const executions = listed?.executions ?? [];
    const total = listed?.total ?? executions.length;

    let completed = 0;
    let failed = 0;
    let inprogress = 0;
    let durationSum = 0;
    let durationCount = 0;
    let maxDuration = 0;
    const perDay = new Map<string, { completed: number; failed: number }>();

    for (const execution of executions) {
      const status = execution.status;
      const duration = execution.duration_ms ?? 0;
      const day = execution.started_at
        ? execution.started_at.slice(0, 10)
        : 'unknown';
      const bucket = perDay.get(day) ?? { completed: 0, failed: 0 };

      if (status === 'completed') {
        completed += 1;
        bucket.completed += 1;
      } else if (status === 'failed') {
        failed += 1;
        bucket.failed += 1;
      } else if (status === 'inprogress') {
        inprogress += 1;
      }

      if (status === 'completed' || status === 'failed') {
        durationSum += duration;
        durationCount += 1;
        if (duration > maxDuration) {
          maxDuration = duration;
        }
      }
      perDay.set(day, bucket);
    }

    const finished = completed + failed;
    res.json({
      workflow_name: req.params.name,
      runs: total,
      sampled: executions.length,
      completed,
      failed,
      inprogress,
      success_rate: finished > 0 ? completed / finished : null,
      avg_duration_ms: durationCount > 0 ? durationSum / durationCount : null,
      max_duration_ms: durationCount > 0 ? maxDuration : null,
      per_day: [...perDay.entries()]
        .filter(([day]) => day !== 'unknown')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, ...counts })),
    });
  });

  // --- Workflow executions -------------------------------------------------

  router.get('/executions', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const { workflow_name: workflowName, status } = req.query;

    if (status !== undefined && typeof status !== 'string') {
      throw new InputError('status must be provided at most once');
    }
    if (
      status !== undefined &&
      !EXECUTION_STATUSES.includes(
        status as (typeof EXECUTION_STATUSES)[number],
      )
    ) {
      throw new InputError(
        `status must be one of: ${EXECUTION_STATUSES.join(', ')}`,
      );
    }

    const args: Record<string, unknown> = {};
    if (typeof workflowName === 'string' && workflowName !== '') {
      args.workflow_name = workflowName;
    }
    if (typeof status === 'string') {
      args.status = status;
    }
    const limit = parseOptionalInt(req.query.limit, 'limit');
    if (limit !== undefined) {
      args.limit = limit;
    }
    const offset = parseOptionalInt(req.query.offset, 'offset');
    if (offset !== undefined) {
      args.offset = offset;
    }

    const result = await client.callTool(
      'core_workflow_execution_list',
      args,
      readCallOptions(req, installation),
    );
    res.json(result);
  });

  router.get('/executions/:id', async (req, res) => {
    const { config: installation, client } = resolveInstallation(req);
    const result = await client.callTool(
      'core_workflow_execution_get',
      { execution_id: req.params.id, include_steps: true },
      readCallOptions(req, installation),
    );
    res.json(result);
  });

  return router;
}
