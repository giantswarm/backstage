import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AuthenticationError,
  InputError,
  ServiceUnavailableError,
} from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { MusterMcpClient, readMusterServerFromConfig } from './MusterMcpClient';

const EXECUTION_STATUSES = ['inprogress', 'completed', 'failed'] as const;

/**
 * Header the muster frontend uses to forward the user's OAuth token for the
 * muster server's `authProvider`. Mirrors ai-chat's
 * `backstage-ai-chat-authorization-<provider>` scheme, but since this proxy
 * only ever talks to a single server, no provider suffix is needed.
 */
export const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  /** Overridable for tests. */
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

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config } = options;

  let client = options.client;
  const server = readMusterServerFromConfig(config, logger);
  if (!client) {
    if (server) {
      client = new MusterMcpClient(server, logger);
      logger.info(
        `Muster workflow proxy connected to ${server.url}${
          server.authProvider
            ? ` (per-user auth via provider '${server.authProvider}')`
            : ''
        }`,
      );
    } else {
      logger.info(
        'No muster MCP server configured (aiChat.mcp entry named per muster.serverName, default "muster"); workflow endpoints will return 503.',
      );
    }
  }

  const router = Router();
  router.use(express.json());

  router.get('/health', (_, res) => {
    res.json({ status: 'ok', configured: Boolean(client) });
  });

  const requireClient = (): MusterMcpClient => {
    if (!client) {
      throw new ServiceUnavailableError(
        'No muster MCP server is configured. Add an entry named "muster" to aiChat.mcp (or set muster.serverName).',
      );
    }
    return client;
  };

  /**
   * When the configured server requires per-user auth, the frontend must
   * forward the user's token; without it the muster server would reject the
   * connection anyway, so fail fast with a 401 the frontend can act on.
   */
  const readCallOptions = (req: express.Request): { authToken?: string } => {
    if (!server?.authProvider) {
      return {};
    }
    const headerValue = req.headers[MUSTER_AUTH_HEADER];
    const authToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!authToken) {
      throw new AuthenticationError(
        `The muster MCP server requires a user token for auth provider '${server.authProvider}', but the request did not include one.`,
      );
    }
    return { authToken };
  };

  router.get('/workflows', async (req, res) => {
    const result = await requireClient().callTool(
      'core_workflow_list',
      {},
      readCallOptions(req),
    );
    res.json(result);
  });

  router.get('/workflows/:name', async (req, res) => {
    const result = await requireClient().callTool(
      'core_workflow_get',
      {
        name: req.params.name,
      },
      readCallOptions(req),
    );
    res.json(result);
  });

  router.get('/executions', async (req, res) => {
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

    const result = await requireClient().callTool(
      'core_workflow_execution_list',
      args,
      readCallOptions(req),
    );
    res.json(result);
  });

  router.get('/executions/:id', async (req, res) => {
    const result = await requireClient().callTool(
      'core_workflow_execution_get',
      {
        execution_id: req.params.id,
        include_steps: true,
      },
      readCallOptions(req),
    );
    res.json(result);
  });

  return router;
}
