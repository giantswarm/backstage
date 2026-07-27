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

  router.get('/kagent/sessions', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.listSessions({
      userToken: readUserToken(req, { required: true }),
    });
    res.json(result);
  });

  /**
   * Version probe, used for per-installation capability negotiation. The token
   * is forwarded when available but not required: kagent's `/version` is
   * unauthenticated in-process, so this still works if a deployment ever puts
   * it outside the oauth2-proxy, and a token-mint failure never turns the probe
   * into a hard 401.
   */
  router.get('/kagent/version', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.getVersion({
      userToken: readUserToken(req, { required: false }),
    });
    res.json(result);
  });

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
