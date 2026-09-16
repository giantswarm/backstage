import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import {
  AuthenticationError,
  InputError,
  NotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import {
  asConnected,
  MUSTER_AUTH_HEADER,
  MusterServerGateway,
  MusterServerNotConnectedError,
} from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import Router from 'express-promise-router';

/** A repository name, with or without the org: `muster` or `giantswarm/muster`. */
const REPOSITORY_PATTERN = /^(?:[\w.-]+\/)?[\w.-]+$/;

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
  inactiveDays: 'number',
  minOrphanScore: 'number',
  decision: 'string',
  finding: 'string',
  undeclared: 'boolean',
  limit: 'number',
  stalePeriodDays: 'number',
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
    const stalePeriodDays = singleQueryValue(
      req.query.stalePeriodDays,
      'stalePeriodDays',
    );
    res.json(
      await call(req, 'get_repository', {
        repository: repositoryName(req.params.name),
        ...(stalePeriodDays !== undefined && {
          stalePeriodDays: Number(stalePeriodDays),
        }),
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
        /\b403\b|forbidden|refused|not a member/i.test(error.message)
      ) {
        next(new NotAllowedError(error.message));
        return;
      }
      if (
        error instanceof Error &&
        /\b404\b|not found|no record|neither declared/i.test(error.message)
      ) {
        next(new NotFoundError(error.message));
        return;
      }
      next(error);
    },
  );

  return router;
}
