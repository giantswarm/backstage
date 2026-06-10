import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import {
  MusterMcpClient,
  readMusterServerFromConfig,
} from './MusterMcpClient';

const EXECUTION_STATUSES = ['inprogress', 'completed', 'failed'] as const;

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
  const parsed = Number(value);
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
  if (!client) {
    const server = readMusterServerFromConfig(config, logger);
    if (server) {
      client = new MusterMcpClient(server, logger);
      logger.info(`Muster workflow proxy connected to ${server.url}`);
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
      const error = new Error(
        'No muster MCP server is configured. Add an entry named "muster" to aiChat.mcp (or set muster.serverName).',
      );
      error.name = 'ServiceUnavailableError';
      throw error;
    }
    return client;
  };

  router.get('/workflows', async (_req, res) => {
    const result = await requireClient().callTool('core_workflow_list', {});
    res.json(result);
  });

  router.get('/workflows/:name', async (req, res) => {
    const result = await requireClient().callTool('core_workflow_get', {
      name: req.params.name,
    });
    res.json(result);
  });

  router.get('/executions', async (req, res) => {
    const { workflow_name: workflowName, status } = req.query;

    if (
      status !== undefined &&
      !EXECUTION_STATUSES.includes(status as (typeof EXECUTION_STATUSES)[number])
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
    );
    res.json(result);
  });

  // Map ServiceUnavailableError (and upstream muster failures) to proper
  // HTTP status codes instead of generic 500s.
  router.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      if (err.name === 'ServiceUnavailableError') {
        res.status(503).json({ error: { name: err.name, message: err.message } });
        return;
      }
      next(err);
    },
  );

  return router;
}
