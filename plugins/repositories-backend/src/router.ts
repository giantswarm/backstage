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

/** A repository name, with or without the org: `muster` or `giantswarm/muster`. */
const REPOSITORY_PATTERN = /^(?:[\w.-]+\/)?[\w.-]+$/;

type ArgumentKind = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * The `list_repositories` arguments the page may pass, with how each query
 * parameter is read. The names are the tool's own; the page composes
 * nothing, so the backend only checks types and hands them on.
 */
const LIST_ARGUMENTS: Record<string, 'string' | 'number' | 'boolean'> = {
  scope: 'string',
  search: 'string',
  renovate: 'string',
  team: 'string',
  visibility: 'string',
  fork: 'boolean',
  lifecycle: 'string',
  archived: 'boolean',
  inactiveDays: 'number',
  finding: 'string',
  orb: 'string',
  arm64: 'boolean',
  chinaPush: 'string',
  signing: 'string',
  limit: 'number',
};

/** The two arguments every write tool of the manager takes. */
const WRITE_OPTIONS: Record<string, ArgumentKind> = {
  dryRun: 'boolean',
  // Handed on as given: the manager refuses everything but "commit" with its
  // own reason, which the page shows verbatim.
  mode: 'string',
};

/**
 * The arguments each write (or dry-run) tool takes from a request body, by
 * tool. The names are the tools' own; the backend checks the type of every
 * value and refuses an argument the tool does not take, nothing more -- the
 * declaration entry itself is validated by the manager, not here.
 */
const BODY_ARGUMENTS: Record<string, Record<string, ArgumentKind>> = {
  // The dry run takes exactly the arguments the commit takes, the reason
  // included: the page reviews the very request it then commits.
  validate_repository: {
    team: 'string',
    entry: 'object',
    entries: 'array',
    reason: 'string',
  },
  create_repository: {
    team: 'string',
    entry: 'object',
    entries: 'array',
    reason: 'string',
    ...WRITE_OPTIONS,
  },
  update_repository: { entry: 'object', reason: 'string', ...WRITE_OPTIONS },
  transfer_repository: {
    toTeam: 'string',
    reason: 'string',
    ...WRITE_OPTIONS,
  },
  set_lifecycle: { lifecycle: 'string', reason: 'string', ...WRITE_OPTIONS },
  align_repository: { team: 'string', ...WRITE_OPTIONS },
  // Read-only, a POST for the body: the pull request the creation opened and
  // how long one call may wait -- the manager bounds it (at most 150 s).
  watch_repository: { pullRequest: 'number', timeout: 'number' },
};

export interface RouterOptions {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  /** giantswarm-repo-manager as the caller, through muster; undefined when unconfigured. */
  manager?: MusterServerGateway;
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

/** Reads the tool arguments out of a request's query string, typed. */
export function listArguments(
  query: Record<string, unknown>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(LIST_ARGUMENTS)) {
    const raw = singleQueryValue(query[name], name);
    if (raw === undefined || raw === '') {
      continue;
    }
    if (kind === 'string') {
      args[name] = raw;
    } else if (kind === 'boolean') {
      if (raw !== 'true' && raw !== 'false') {
        throw new InputError(`${name} must be true or false`);
      }
      args[name] = raw === 'true';
    } else {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        throw new InputError(`${name} must be a non-negative number`);
      }
      args[name] = value;
    }
  }
  return args;
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
export function bodyArguments(
  body: unknown,
  tool: keyof typeof BODY_ARGUMENTS,
): Record<string, unknown> {
  const spec = BODY_ARGUMENTS[tool];
  if (!isKind(body, 'object')) {
    throw new InputError(`${tool} expects a JSON object body`);
  }
  const args: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(body as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }
    const kind = spec[name];
    if (!kind) {
      throw new InputError(`${tool} takes no argument '${name}'`);
    }
    if (!isKind(value, kind)) {
      throw new InputError(`${name} must be a ${kind}`);
    }
    args[name] = value;
  }
  return args;
}

function repositoryName(raw: string): string {
  if (!REPOSITORY_PATTERN.test(raw)) {
    throw new InputError(`'${raw}' is not a repository name`);
  }
  return raw;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, httpAuth, manager } = options;

  if (!manager) {
    logger.info(
      'No muster repo-manager server configured (set repositories.muster); repositories endpoints will return 503.',
    );
  }

  const gateway = (): MusterServerGateway => {
    if (!manager) {
      throw new ServiceUnavailableError(
        'giantswarm-repo-manager through muster is not configured. Set repositories.muster.',
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
        `Repositories requests need the caller's muster token in the ${MUSTER_AUTH_HEADER} header.`,
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

  // The inventory names every repository of the org, private ones included;
  // require a Backstage user.
  router.use(async (req, _res, next) => {
    await httpAuth.credentials(req, { allow: ['user'] });
    next();
  });

  /**
   * Whether the caller's muster session can reach the manager, and the
   * sign-in URL when it cannot yet -- the page bounces through it and lands
   * back.
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

  router.get('/info', async (req, res) => {
    res.json(await call(req, 'get_info', {}));
  });

  router.get('/repositories', async (req, res) => {
    res.json(
      await call(
        req,
        'list_repositories',
        listArguments(req.query as Record<string, unknown>),
      ),
    );
  });

  router.get('/repositories/:name', async (req, res) => {
    res.json(
      await call(req, 'get_repository', {
        repository: repositoryName(req.params.name),
      }),
    );
  });

  // Rebuilds the record from GitHub, CircleCI and the team files; writes the
  // manager's cache only, nothing on GitHub.
  router.post('/repositories/:name/refresh', async (req, res) => {
    res.json(
      await call(req, 'refresh_repository', {
        repository: repositoryName(req.params.name),
      }),
    );
  });

  // The dry run of declaring new repositories: the rendered entries, the
  // implied template, the name checks, the refusals as data and the guard
  // notices. Read-only; a POST for the body.
  router.post('/repositories/validate', async (req, res) => {
    res.json(
      await call(
        req,
        'validate_repository',
        bodyArguments(req.body, 'validate_repository'),
      ),
    );
  });

  // Every write below runs as the signed-in person and lands as a team-file
  // pull request under their name (`mode: commit`), or renders the change
  // (`dryRun: true`). The manager owns the modes: whatever else the body
  // asks for is refused by it, with the reason.
  router.post('/repositories', async (req, res) => {
    res.json(
      await call(
        req,
        'create_repository',
        bodyArguments(req.body, 'create_repository'),
      ),
    );
  });

  /** One tool of a repository, its arguments read out of the body. */
  const toolOfRepository = (path: string, tool: keyof typeof BODY_ARGUMENTS) =>
    router.post(`/repositories/:name/${path}`, async (req, res) => {
      res.json(
        await call(req, tool, {
          repository: repositoryName(req.params.name),
          ...bodyArguments(req.body, tool),
        }),
      );
    });

  toolOfRepository('update', 'update_repository');
  toolOfRepository('transfer', 'transfer_repository');
  toolOfRepository('lifecycle', 'set_lifecycle');
  toolOfRepository('align', 'align_repository');

  // Follows a repository just created to readiness: one call blocks until a
  // phase completes, the repository is ready or fails, or the timeout runs
  // out, and answers with the phases reached; the page calls again while
  // it is neither ready nor failed. Read-only.
  toolOfRepository('watch', 'watch_repository');

  // A missing grant is a 401 that carries the sign-in URL; the manager's own
  // refusals are 403s and an unknown repository a 404, so neither pages us as
  // a server fault.
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
        /\b404\b|not found|no record|neither declared/i.test(error.message)
      ) {
        next(new NotFoundError(error.message));
        return;
      }
      // A tool-level refusal -- mode "apply", a name that is taken, a
      // declaration the engine refuses, a non-member -- arrives as a plain
      // Error carrying the manager's reason; it is the manager's decision,
      // shown to the person as such, not a fault of ours. A broken
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
