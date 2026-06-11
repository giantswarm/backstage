import express from 'express';
import Router from 'express-promise-router';
import {
  HttpAuthService,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';

/**
 * Header used by the frontend to forward the user's main Dex ID token, which
 * the broker exchanges for a per-management-cluster token. Backstage does not
 * expose provider sessions server-side, so the token travels alongside the
 * regular Backstage credentials (same pattern the AI chat uses for MCP auth).
 */
export const SUBJECT_TOKEN_HEADER = 'gs-subject-token';

const TOKEN_EXCHANGE_GRANT_TYPE =
  'urn:ietf:params:oauth:grant-type:token-exchange';
const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token';

/**
 * Minimum remaining lifetime before a cached token is re-exchanged. Must be
 * larger than the frontend's session refresh margin (3 minutes in OAuth2's
 * sessionShouldRefresh), so a refresh-triggering request never gets a token
 * that immediately triggers another refresh.
 */
const EXPIRY_SKEW_SECONDS = 240;

/** Fallback lifetime when the broker response carries no expires_in. */
const DEFAULT_EXPIRES_IN_SECONDS = 300;

type CachedToken = {
  token: string;
  expiresAt: number;
};

export interface ClusterTokenRouterOptions {
  config: RootConfigService;
  logger: LoggerService;
  httpAuth: HttpAuthService;
}

/**
 * Creates the cluster token service router, exposed as
 * `POST /api/auth/cluster-token/:installation`.
 *
 * Given the caller's authenticated Backstage session and their main Dex ID
 * token (forwarded in the `gs-subject-token` header), it mints a short-lived
 * per-management-cluster token through the muster token broker (RFC 8693
 * token exchange) and caches it per (user, installation) with expiry-aware
 * re-exchange. Exchanged tokens are returned to the frontend as short-lived
 * credentials and are never persisted.
 *
 * Returns undefined when no broker is configured (`gs.clusterTokenBroker`).
 */
export function createClusterTokenRouter(
  options: ClusterTokenRouterOptions,
): express.Router | undefined {
  const { config, logger, httpAuth } = options;

  const brokerConfig = config.getOptionalConfig('gs.clusterTokenBroker');
  if (!brokerConfig) {
    return undefined;
  }

  const tokenUrl = brokerConfig.getString('tokenUrl');
  const clientId = brokerConfig.getString('clientId');
  const clientSecret = brokerConfig.getString('clientSecret');
  const scope = brokerConfig.getOptionalString('scope');

  const tokenCache = new Map<string, CachedToken>();

  const pruneExpired = (now: number) => {
    for (const [key, value] of tokenCache) {
      if (value.expiresAt <= now) {
        tokenCache.delete(key);
      }
    }
  };

  const router = Router();

  router.post(
    '/cluster-token/:installation',
    async (req: express.Request, res: express.Response) => {
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const userEntityRef = credentials.principal.userEntityRef;

      const { installation } = req.params;
      if (typeof installation !== 'string') {
        throw new InputError('Invalid installation parameter');
      }
      const installationsConfig = config.getOptionalConfig('gs.installations');
      if (!installationsConfig || !installationsConfig.has(installation)) {
        throw new NotFoundError(`Unknown installation "${installation}"`);
      }
      const audience =
        installationsConfig
          .getConfig(installation)
          .getOptionalString('clusterTokenAudience') ?? installation;

      const subjectToken = req.header(SUBJECT_TOKEN_HEADER);
      if (!subjectToken) {
        throw new InputError(`Missing ${SUBJECT_TOKEN_HEADER} header`);
      }

      res.setHeader('Cache-Control', 'no-store');

      const now = Date.now();
      pruneExpired(now);

      const cacheKey = `${userEntityRef}:${installation}`;
      const cached = tokenCache.get(cacheKey);
      if (cached && cached.expiresAt - now > EXPIRY_SKEW_SECONDS * 1000) {
        res.json({
          token: cached.token,
          expiresInSeconds: Math.floor((cached.expiresAt - now) / 1000),
        });
        return;
      }

      const params = new URLSearchParams({
        grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
        subject_token: subjectToken,
        subject_token_type: ID_TOKEN_TYPE,
        audience,
      });
      if (scope) {
        params.set('scope', scope);
      }

      let response: Response;
      try {
        response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(
              `${clientId}:${clientSecret}`,
            ).toString('base64')}`,
          },
          body: params.toString(),
        });
      } catch (error) {
        logger.warn(
          `Cluster token exchange for installation "${installation}" failed: broker unreachable`,
          error as Error,
        );
        res.status(502).json({ error: 'Token broker is unreachable' });
        return;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.warn(
          `Cluster token exchange for installation "${installation}" failed with status ${response.status}: ${body}`,
        );
        tokenCache.delete(cacheKey);
        res.status(502).json({ error: 'Token exchange failed' });
        return;
      }

      const tokenResponse = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (!tokenResponse.access_token) {
        logger.warn(
          `Cluster token exchange for installation "${installation}" returned no access_token`,
        );
        res.status(502).json({ error: 'Token exchange failed' });
        return;
      }

      const expiresInSeconds =
        tokenResponse.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS;
      tokenCache.set(cacheKey, {
        token: tokenResponse.access_token,
        expiresAt: now + expiresInSeconds * 1000,
      });

      logger.debug(
        `Minted cluster token for ${userEntityRef} on installation "${installation}" (audience "${audience}", expires in ${expiresInSeconds}s)`,
      );

      res.json({ token: tokenResponse.access_token, expiresInSeconds });
    },
  );

  return router;
}
