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
  DEFAULT_MODEL_MANAGER_LOAD_TIMEOUT_MS,
  DEFAULT_MODEL_MANAGER_TIMEOUT_MS,
  MODEL_MANAGER_AUTH_HEADER,
  MODEL_REF_MAX_LENGTH,
  MODEL_REF_PATTERN,
  ModelManagerClient,
  readModelManagerInstallationsFromConfig,
} from './ModelManagerClient';

export interface ModelManagerRouterOptions {
  logger: LoggerService;
  config: Config;
  /** Overridable for tests; used as the client for every installation. */
  client?: ModelManagerClient;
}

/** Longest `keepAlive` duration string forwarded (`10m`, `-1`, `2h30m`). */
const KEEP_ALIVE_MAX_LENGTH = 32;

function singleQueryValue(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InputError(`${name} must be provided at most once`);
  }
  return value;
}

/**
 * The `model` field every mutating route takes: a backend-native model
 * reference, trimmed and bounded. Validated here rather than left to
 * model-manager because a 400 from this proxy names the field, while an
 * upstream rejection arrives as a generic "invalid request".
 */
function readModelRef(body: Record<string, unknown>): string {
  const value = body.model;
  if (typeof value !== 'string') {
    throw new InputError('model must be a string');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new InputError('model must not be empty');
  }
  if (trimmed.length > MODEL_REF_MAX_LENGTH) {
    throw new InputError(
      `model must be at most ${MODEL_REF_MAX_LENGTH} characters`,
    );
  }
  if (!MODEL_REF_PATTERN.test(trimmed)) {
    throw new InputError(
      'model must be a model reference such as smollm2:135m or hf.co/org/repo:Q4_K_M',
    );
  }
  return trimmed;
}

function readOptionalBoolean(
  body: Record<string, unknown>,
  field: string,
): boolean | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new InputError(`${field} must be a boolean`);
  }
  return value;
}

/**
 * Routes under `/model-manager/...`: a thin, authenticated pass-through of the
 * model-manager REST API (giantswarm/model-manager, `api/openapi.yaml`) per
 * installation, next to the kagent proxy.
 *
 * Every route except `/model-manager/installations` takes `?installation=` and
 * **requires** the user's per-installation Dex ID token in
 * {@link MODEL_MANAGER_AUTH_HEADER}, which becomes `Authorization: Bearer`
 * toward model-manager. The proxy itself decides nothing from the token —
 * the gateway route's JWT policy in front of model-manager is the trust
 * boundary (see the header's documentation) — but a request that could not
 * carry one is refused here with a 401 the frontend can act on, instead of
 * being sent to fail at the gateway.
 *
 * Bodies are forwarded and answered verbatim: this proxy is transport, and the
 * frontend owns the schema, so a model-manager field added tomorrow reaches the
 * UI without a backend release.
 */
export function createModelManagerRouter(
  options: ModelManagerRouterOptions,
): express.Router {
  const { logger, config } = options;

  const installations = readModelManagerInstallationsFromConfig(config, logger);
  const timeoutMs =
    config.getOptionalNumber('agentPlatform.modelManager.timeoutMs') ??
    DEFAULT_MODEL_MANAGER_TIMEOUT_MS;
  const loadTimeoutMs =
    config.getOptionalNumber('agentPlatform.modelManager.loadTimeoutMs') ??
    DEFAULT_MODEL_MANAGER_LOAD_TIMEOUT_MS;

  // One client per installation. When a client is injected (tests), reuse it
  // for every installation, synthesizing one if none is configured so routing
  // still resolves.
  const clients = new Map<string, ModelManagerClient>();
  if (options.client) {
    if (installations.size === 0) {
      installations.set('test', {
        name: 'test',
        apiBaseUrl: 'https://model-manager.test',
      });
    }
    for (const name of installations.keys()) {
      clients.set(name, options.client);
    }
  } else {
    for (const [name, installation] of installations) {
      clients.set(
        name,
        new ModelManagerClient(
          installation,
          logger,
          fetch,
          timeoutMs,
          loadTimeoutMs,
        ),
      );
      logger.info(
        `model-manager proxy installation '${name}' pointed at ${installation.apiBaseUrl}`,
      );
    }
  }

  const router = Router();
  router.use(express.json());

  /**
   * The installations this proxy can reach model-manager on. Names only, on
   * purpose: the URL embeds the installation's gateway hostname, which is
   * backend-only for the same reason `gs.installations` is. The frontend
   * intersects these with the installations it already considers reachable.
   */
  router.get('/model-manager/installations', (_, res) => {
    res.json({
      installations: [...installations.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(name => ({ name })),
    });
  });

  const resolveClient = (req: express.Request): ModelManagerClient => {
    if (clients.size === 0) {
      // Only reachable by a hand-made request: with nothing configured,
      // `/model-manager/installations` is empty and the frontend queries
      // nothing. A 503 is right for a genuine misconfiguration.
      throw new ServiceUnavailableError(
        'No model-manager installation is configured. Set agentPlatform.modelManager.installations.<name>.apiBaseUrl.',
      );
    }

    const configured = [...clients.keys()].join(', ');
    const name = singleQueryValue(req.query.installation, 'installation');
    if (!name) {
      throw new InputError(
        `installation query parameter is required; configured installations: ${configured}`,
      );
    }

    const client = clients.get(name);
    if (!client) {
      throw new InputError(
        `Unknown model-manager installation '${name}'; configured installations: ${configured}`,
      );
    }
    return client;
  };

  const readUserToken = (req: express.Request): string => {
    const headerValue = req.headers[MODEL_MANAGER_AUTH_HEADER];
    const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!token) {
      throw new AuthenticationError(
        'The request did not include a user token for the target model-manager installation.',
      );
    }
    return token;
  };

  const body = (req: express.Request): Record<string, unknown> =>
    (req.body ?? {}) as Record<string, unknown>;

  /**
   * `req.params.name` for the `*name` wildcard below. Express 5 hands a
   * wildcard's segments back as an array (one entry per `/`-separated part),
   * decoded; joining them restores a reference such as `hf.co/org/repo:Q4_K_M`.
   */
  const readModelName = (req: express.Request): string => {
    const raw = req.params.name as unknown;
    const name = Array.isArray(raw) ? raw.join('/') : String(raw ?? '');
    if (!name) {
      throw new InputError('model name is required');
    }
    return name;
  };

  router.get('/model-manager/backend', async (req, res) => {
    const client = resolveClient(req);
    res.json(await client.getBackend({ userToken: readUserToken(req) }));
  });

  router.get('/model-manager/models', async (req, res) => {
    const client = resolveClient(req);
    res.json(await client.listModels({ userToken: readUserToken(req) }));
  });

  router.get('/model-manager/loaded', async (req, res) => {
    const client = resolveClient(req);
    res.json(await client.listLoaded({ userToken: readUserToken(req) }));
  });

  // The operation routes are registered before the wildcard `GET|DELETE
  // /models/*name` on purpose — Express matches in order, and although the
  // methods differ today, a future GET on one of these names must not be
  // mistaken for a model called "pull".
  router.post('/model-manager/models/pull', async (req, res) => {
    const client = resolveClient(req);
    const userToken = readUserToken(req);
    const model = readModelRef(body(req));
    const wire = readOptionalBoolean(body(req), 'wire');
    const result = await client.pullModel(
      { model, ...(wire !== undefined && { wire }) },
      { userToken },
    );
    // 202, matching model-manager's own answer: the import has started, the
    // body is the job to poll.
    res.status(202).json(result);
  });

  router.post('/model-manager/models/load', async (req, res) => {
    const client = resolveClient(req);
    const userToken = readUserToken(req);
    const model = readModelRef(body(req));
    const rawKeepAlive = body(req).keepAlive;
    let keepAlive: string | undefined;
    if (rawKeepAlive !== undefined) {
      if (typeof rawKeepAlive !== 'string') {
        throw new InputError('keepAlive must be a string');
      }
      keepAlive = rawKeepAlive.trim();
      if (!keepAlive) {
        keepAlive = undefined;
      } else if (keepAlive.length > KEEP_ALIVE_MAX_LENGTH) {
        throw new InputError(
          `keepAlive must be at most ${KEEP_ALIVE_MAX_LENGTH} characters`,
        );
      }
    }
    res.json(
      await client.loadModel(
        { model, ...(keepAlive !== undefined && { keepAlive }) },
        { userToken },
      ),
    );
  });

  router.post('/model-manager/models/unload', async (req, res) => {
    const client = resolveClient(req);
    const userToken = readUserToken(req);
    const model = readModelRef(body(req));
    res.json(await client.unloadModel({ model }, { userToken }));
  });

  router.post('/model-manager/models/wire', async (req, res) => {
    const client = resolveClient(req);
    const userToken = readUserToken(req);
    const model = readModelRef(body(req));
    res.json(await client.wireModel({ model }, { userToken }));
  });

  router.post('/model-manager/models/unwire', async (req, res) => {
    const client = resolveClient(req);
    const userToken = readUserToken(req);
    const model = readModelRef(body(req));
    res.json(await client.unwireModel({ model }, { userToken }));
  });

  router.get('/model-manager/models/*name', async (req, res) => {
    const client = resolveClient(req);
    const userToken = readUserToken(req);
    res.json(await client.getModel(readModelName(req), { userToken }));
  });

  /**
   * Delete a downloaded model. `?unwire=false` keeps the ModelConfig
   * model-manager created for it; the default (like model-manager's own) is to
   * remove both, so that agents are not left pointing at a model that is gone.
   */
  router.delete('/model-manager/models/*name', async (req, res) => {
    const client = resolveClient(req);
    const userToken = readUserToken(req);
    const rawUnwire = singleQueryValue(req.query.unwire, 'unwire');
    if (
      rawUnwire !== undefined &&
      rawUnwire !== 'true' &&
      rawUnwire !== 'false'
    ) {
      throw new InputError("unwire must be 'true' or 'false'");
    }
    const unwire = rawUnwire !== 'false';
    res.json(
      await client.deleteModel(readModelName(req), unwire, { userToken }),
    );
  });

  router.get('/model-manager/jobs', async (req, res) => {
    const client = resolveClient(req);
    res.json(await client.listJobs({ userToken: readUserToken(req) }));
  });

  router.get('/model-manager/jobs/:jobId', async (req, res) => {
    const client = resolveClient(req);
    const userToken = readUserToken(req);
    res.json(await client.getJob(String(req.params.jobId), { userToken }));
  });

  router.delete('/model-manager/jobs/:jobId', async (req, res) => {
    const client = resolveClient(req);
    const userToken = readUserToken(req);
    res.json(await client.cancelJob(String(req.params.jobId), { userToken }));
  });

  return router;
}
