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
  DEFAULT_KAGENT_TIMEOUT_MS,
  KAGENT_AUTH_HEADER,
  KagentClient,
  KagentInstallationConfig,
  readKagentInstallationsFromConfig,
} from './KagentClient';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  /** Overridable for tests; used as the client for every installation. */
  client?: KagentClient;
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

  const installations = readKagentInstallationsFromConfig(config, logger);
  const timeoutMs =
    config.getOptionalNumber('agentPlatform.kagent.timeoutMs') ??
    DEFAULT_KAGENT_TIMEOUT_MS;

  // One client per installation. When a client is injected (tests), reuse it
  // for every installation, synthesizing one if none is configured so routing
  // still resolves.
  const clients = new Map<string, KagentClient>();
  if (options.client) {
    if (installations.size === 0) {
      installations.set('test', {
        name: 'test',
        apiBaseUrl: 'https://kagent.test/api',
      });
    }
    for (const name of installations.keys()) {
      clients.set(name, options.client);
    }
  } else {
    for (const [name, installation] of installations) {
      clients.set(
        name,
        new KagentClient(installation, logger, fetch, timeoutMs),
      );
      logger.info(
        `kagent proxy installation '${name}' pointed at ${installation.apiBaseUrl}`,
      );
    }
  }

  if (installations.size === 0) {
    logger.info(
      'No kagent installations resolved (needs gs.installations entries with a baseDomain, or an explicit agentPlatform.kagent.installations block); kagent endpoints will return 503.',
    );
  }

  const router = Router();
  router.use(express.json());

  router.get('/health', (_, res) => {
    res.json({ status: 'ok', configured: clients.size });
  });

  /**
   * The installations this proxy can reach kagent on. Names only, on purpose:
   * the URL is derived from `baseDomain`, which is backend-only because it
   * deanonymizes customers. The frontend intersects these with the
   * installations it already considers reachable.
   */
  router.get('/kagent/installations', (_, res) => {
    res.json({
      installations: [...installations.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(name => ({ name })),
    });
  });

  /**
   * Resolve the target installation from `?installation=`. Always required:
   * the fleet normally has several installations, so there is no sensible
   * default to fall back to.
   */
  const resolveInstallation = (
    req: express.Request,
  ): { config: KagentInstallationConfig; client: KagentClient } => {
    if (clients.size === 0) {
      // Kept as a 503 — unlike "kagent is absent on this installation", nothing
      // configured at all is a genuine misconfiguration worth a Sentry event. It
      // also cannot spam: with no installations resolved, `/kagent/installations`
      // returns an empty list and the frontend queries nothing, so this is only
      // ever reached by a hand-made request.
      throw new ServiceUnavailableError(
        'No kagent installation is configured. Add gs.installations entries with a baseDomain, or set agentPlatform.kagent.installations.',
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
    const installationConfig = installations.get(name);
    if (!client || !installationConfig) {
      throw new InputError(
        `Unknown kagent installation '${name}'; configured installations: ${configured}`,
      );
    }
    return { config: installationConfig, client };
  };

  /**
   * Read the forwarded per-installation Dex ID token.
   *
   * Required for data reads: kagent scopes sessions to the token's `sub`, so
   * without one the request would either be rejected or (under kagent's
   * `unsecure` mode) silently answered for a shared default user. Failing fast
   * with a 401 is something the frontend can act on.
   */
  const readUserToken = (
    req: express.Request,
    opts: { required: boolean },
  ): string | undefined => {
    const headerValue = req.headers[KAGENT_AUTH_HEADER];
    const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!token && opts.required) {
      throw new AuthenticationError(
        'The request did not include a user token for the target kagent installation.',
      );
    }
    return token;
  };

  /**
   * Read the session id from the path.
   *
   * Session ids are **opaque**: real kagent responses mix 64-character hex
   * strings and UUIDs, so nothing here validates or normalizes one. In
   * particular there is deliberately no `trim()` — Express hands us the decoded
   * segment, so an id with surrounding whitespace would be trimmed here,
   * re-encoded on the way out, and a *different* id sent upstream, producing a
   * 404 indistinguishable from a missing session.
   *
   * This is purely a typing shim: `req.params` is loosely typed, but `:sessionId`
   * cannot match an empty segment, so `/kagent/sessions/` reaches the list route
   * above rather than arriving here empty (pinned by a test).
   */
  const readSessionId = (req: express.Request): string => {
    const raw = req.params.sessionId;
    return typeof raw === 'string' ? raw : '';
  };

  router.get('/kagent/sessions', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.listSessions({
      userToken: readUserToken(req, { required: true }),
    });
    res.json(result);
  });

  /**
   * One session's metadata and stored events. Express matches these paths
   * exactly, so this and the list route above do not shadow each other.
   *
   * A session that belongs to someone else answers 404 exactly as a deleted one
   * does — kagent scopes the lookup by user id. That is an expected outcome for a
   * stale deep link, so it stays a 404 and never becomes a 5xx (which
   * `MiddlewareFactory.error()` would forward to Sentry).
   */
  router.get('/kagent/sessions/:sessionId', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.getSession(readSessionId(req), {
      userToken: readUserToken(req, { required: true }),
    });
    res.json(result);
  });

  /**
   * Delete one session. kagent soft-deletes it, scoped to the forwarded token's
   * user id — the same scoping the reads rely on.
   *
   * The token is **required**, and it is the whole authorization story for this
   * route: kagent decides who the caller is from it, and a controller running in
   * `unsecure` mode would otherwise delete the shared default user's session on
   * behalf of nobody in particular.
   *
   * Nothing expected reaches a 5xx here. kagent answers 200 even when the session
   * does not exist or belongs to somebody else (its statement matches no rows), and
   * `KagentClient` maps an unreachable installation to a 404 — so this route should
   * never hit `MiddlewareFactory.error()`'s `>= 500` branch, which forwards to
   * Sentry.
   */
  router.delete('/kagent/sessions/:sessionId', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.deleteSession(readSessionId(req), {
      userToken: readUserToken(req, { required: true }),
    });
    res.json(result);
  });

  /** The session's A2A tasks — the conversation, its state and token usage. */
  router.get('/kagent/sessions/:sessionId/tasks', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.listSessionTasks(readSessionId(req), {
      userToken: readUserToken(req, { required: true }),
    });
    res.json(result);
  });

  // There is no version route. kagent serves `/version` at the server root, and
  // neither supported door proxies the root to the controller — the derived
  // door's nginx sends `/` to the kagent UI, and the agentgateway override only
  // matches the `/kagent` prefix. See the comment in KagentClient for details.

  /**
   * Identity probe. Diagnoses the two ways a correct-looking sessions list can
   * be wrong: a `sub` that differs from the one kagent recorded (empty list),
   * and a controller running in `unsecure` mode (shared list).
   */
  router.get('/kagent/me', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.getMe({
      userToken: readUserToken(req, { required: false }),
    });
    res.json(result);
  });

  return router;
}
