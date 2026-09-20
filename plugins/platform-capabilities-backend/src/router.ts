import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import {
  AuthenticationError,
  CustomErrorBase,
  InputError,
  NotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import {
  asConnected,
  isInfrastructureError,
  MUSTER_AUTH_HEADER,
  MusterServerGateway,
  MusterServerNotConnectedError,
} from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import Router from 'express-promise-router';

/** An installation, capability or action name as the manager spells them. */
const NAME_PATTERN = /^[\w.-]+$/;

type ArgumentKind = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * The arguments each write tool takes from a request body. The names are the
 * tools' own; the backend checks the type of every value and refuses an
 * argument the tool does not take, nothing more -- the inputs themselves are
 * validated by the manager against the definition's schema, not here.
 * `dryRun` and `mode` are the write framework's: `mode` is handed on as
 * given and the manager refuses everything but "commit" with its own reason.
 */
const WRITE_ARGUMENTS: Record<string, ArgumentKind> = {
  inputs: 'object',
  content: 'boolean',
  dryRun: 'boolean',
  mode: 'string',
};

/** What `verify_capability` takes besides the names: the person's typed inputs and whether to return file content. */
const VERIFY_ARGUMENTS: Record<string, ArgumentKind> = {
  inputs: 'object',
  content: 'boolean',
};

const CAPABILITY_TOOLS = {
  enable: 'enable_capability',
  reconcile: 'reconcile_capability',
} as const;

export interface RouterOptions {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  /** giantswarm-platform-manager as the caller, through muster; undefined when unconfigured. */
  manager?: MusterServerGateway;
}

function isKind(value: unknown, kind: ArgumentKind): boolean {
  switch (kind) {
    case 'array':
      return Array.isArray(value);
    case 'object':
      return (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      );
    default:
      return typeof value === kind;
  }
}

/**
 * Reads a tool's arguments out of a request body, typed: an argument the
 * tool does not take or a value of the wrong type is refused; `null` and
 * `undefined` are dropped. The values themselves are handed on unchanged.
 */
export function writeArguments(
  body: unknown,
  takes: Record<string, ArgumentKind> = WRITE_ARGUMENTS,
): Record<string, unknown> {
  if (!isKind(body, 'object')) {
    throw new InputError('expects a JSON object body');
  }
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }
    const kind = takes[key];
    if (!kind) {
      throw new InputError(`the tool takes no argument '${key}'`);
    }
    if (!isKind(value, kind)) {
      throw new InputError(`${key} must be a ${kind}`);
    }
    args[key] = value;
  }
  return args;
}

function name(raw: string, what: string): string {
  if (!NAME_PATTERN.test(raw)) {
    throw new InputError(`'${raw}' is not ${what} name`);
  }
  return raw;
}

function singleQueryValue(value: unknown, key: string): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InputError(`${key} must be provided at most once`);
  }
  return value;
}

/**
 * `list_installations`' arguments out of a query string: `installations`
 * (comma-separated), `customer`, and `summary` (`true` for the states and
 * the last actions alone, what the Installations page's columns ask for).
 */
export function listArguments(
  query: Record<string, unknown>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const installations = singleQueryValue(query.installations, 'installations');
  if (installations) {
    args.installations = installations
      .split(',')
      .map(n => name(n.trim(), 'an installation'));
  }
  const customer = singleQueryValue(query.customer, 'customer');
  if (customer) {
    args.customer = customer;
  }
  const summary = singleQueryValue(query.summary, 'summary');
  if (summary !== undefined) {
    if (summary !== 'true' && summary !== 'false') {
      throw new InputError('summary must be true or false');
    }
    args.summary = summary === 'true';
  }
  return args;
}

/** `list_actions`' arguments out of a query string: `installation` and `capability`. */
export function actionsArguments(
  query: Record<string, unknown>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const key of ['installation', 'capability'] as const) {
    const value = singleQueryValue(query[key], key);
    if (value) {
      args[key] = name(value, `${key === 'installation' ? 'an' : 'a'} ${key}`);
    }
  }
  return args;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, httpAuth, manager } = options;

  if (!manager) {
    logger.info(
      'No muster platform-manager server configured (set platformCapabilities.muster); platform-capabilities endpoints will return 503.',
    );
  }

  const gateway = (): MusterServerGateway => {
    if (!manager) {
      throw new ServiceUnavailableError(
        'giantswarm-platform-manager through muster is not configured. Set platformCapabilities.muster.',
      );
    }
    return manager;
  };

  /**
   * The caller's muster token: the frontend forwards the user's Dex ID token,
   * the same one the muster plugin sends. muster forwards it to the manager,
   * which obtains the person's GitHub grant from muster's broker; there is no
   * GitHub credential anywhere in the portal.
   */
  const musterToken = (req: express.Request): string => {
    const header = req.headers[MUSTER_AUTH_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      throw new AuthenticationError(
        `Platform capability requests need the caller's muster token in the ${MUSTER_AUTH_HEADER} header.`,
      );
    }
    return token;
  };

  /** One tool call as the caller. */
  const call = (
    req: express.Request,
    tool: string,
    args: Record<string, unknown>,
  ) => {
    const gw = gateway();
    const token = musterToken(req);
    return asConnected(gw, gw.server, token, () => gw.call(tool, args, token));
  };

  const router = Router();
  router.use(express.json());

  // The registry names every installation, customers included; require a
  // Backstage user.
  router.use(async (req, _res, next) => {
    await httpAuth.credentials(req, { allow: ['user'] });
    next();
  });

  /**
   * Whether the caller's muster session can reach the manager, and the
   * sign-in URL when it cannot yet -- the page bounces through it and lands
   * back; Commit stays disabled until it reads connected.
   */
  router.get('/connection', async (req, res) => {
    const login = await gateway().login(musterToken(req));
    if (login.status === 'connected') {
      res.json({ connected: true });
      return;
    }
    res.json({
      connected: false,
      authUrl: login.authUrl,
      message: login.message,
    });
  });

  // The manager's report of itself: the capability definitions with their
  // input schemas (the form), the write modes, the registry, the actions.
  router.get('/info', async (req, res) => {
    res.json(await call(req, 'get_info', {}));
  });

  router.get('/installations', async (req, res) => {
    res.json(
      await call(
        req,
        'list_installations',
        listArguments(req.query as Record<string, unknown>),
      ),
    );
  });

  // Enable and reconcile run as the signed-in person: `dryRun: true` renders
  // the plan (files per repository, pull requests, generated secrets by
  // name, Dex clients, customer actions, probes); `mode: commit` starts the
  // action. The manager owns the modes and refuses a commit of an
  // installation not opted in, with the reason.
  for (const [path, tool] of Object.entries(CAPABILITY_TOOLS)) {
    router.post(
      `/installations/:installation/capabilities/:capability/${path}`,
      async (req, res) => {
        res.json(
          await call(req, tool, {
            installation: name(req.params.installation, 'an installation'),
            capability: name(req.params.capability, 'a capability'),
            ...writeArguments(req.body),
          }),
        );
      },
    );
  }

  // The comparison: read-only, but it reads every repository and runs the
  // probes, so a POST. With `inputs` it compares what the person typed, as
  // the dialog's review; without, the record and what the files read back.
  router.post(
    '/installations/:installation/capabilities/:capability/verify',
    async (req, res) => {
      res.json(
        await call(req, 'verify_capability', {
          installation: name(req.params.installation, 'an installation'),
          capability: name(req.params.capability, 'a capability'),
          ...writeArguments(req.body ?? {}, VERIFY_ARGUMENTS),
        }),
      );
    },
  );

  router.get('/actions', async (req, res) => {
    res.json(
      await call(
        req,
        'list_actions',
        actionsArguments(req.query as Record<string, unknown>),
      ),
    );
  });

  router.get('/actions/:name', async (req, res) => {
    res.json(
      await call(req, 'get_action', {
        name: name(req.params.name, 'an action'),
      }),
    );
  });

  // A missing grant is a 401 that carries the sign-in URL; the manager's own
  // refusals are 403s and an unknown installation or action a 404, so neither
  // pages us as a server fault.
  router.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (error instanceof MusterServerNotConnectedError) {
        res.status(401).json({
          error: {
            name: error.name,
            message: error.message,
            server: error.server,
            authUrl: error.authUrl,
          },
        });
        return;
      }
      if (
        error instanceof Error &&
        /\b404\b|not found|unknown installation|no action/i.test(error.message)
      ) {
        next(new NotFoundError(error.message));
        return;
      }
      // A tool-level refusal -- mode "apply", an installation not opted in,
      // inputs the definition refuses, a mode not implemented yet -- arrives
      // as a plain Error carrying the manager's reason; it is the manager's
      // decision, shown to the person as such, not a fault of ours. A broken
      // dependency keeps its 5xx.
      if (
        error instanceof Error &&
        !(error instanceof CustomErrorBase) &&
        !isInfrastructureError(error)
      ) {
        next(new NotAllowedError(error.message));
        return;
      }
      next(error);
    },
  );

  return router;
}
