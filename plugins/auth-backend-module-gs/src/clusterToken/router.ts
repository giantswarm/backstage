import express from 'express';
import Router from 'express-promise-router';
import {
  HttpAuthService,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
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

/**
 * One RFC 8693 token endpoint and the confidential client the portal
 * authenticates to it with. `muster` is the broker behind
 * `gs.clusterTokenBroker.tokenUrl`, `dex` an installation's own Dex under
 * `gs.clusterTokenBroker.targets.<installation>`.
 */
type TokenEndpoint = {
  kind: 'muster' | 'dex';
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
};

/**
 * A Dex that mints an installation's cluster token itself, for a portal
 * without a muster broker. Its `connectorId` names the Dex OIDC connector
 * that trusts the portal's main Dex issuer, and `scopes` the scope set of the
 * issued id_token, including Dex's cross-client scope for the apiserver's
 * client (`audience:server:client_id:<client>`).
 */
type DexTarget = TokenEndpoint & {
  kind: 'dex';
  connectorId: string;
  scopes: string;
};

function readDexTargets(brokerConfig: Config): Map<string, DexTarget> {
  const targetsConfig = brokerConfig.getOptionalConfig('targets');
  const targets = new Map<string, DexTarget>();
  for (const installation of targetsConfig?.keys() ?? []) {
    const target = targetsConfig!.getConfig(installation);
    targets.set(installation, {
      kind: 'dex',
      tokenUrl: target.getString('tokenUrl'),
      clientId: target.getString('clientId'),
      clientSecret: target.getString('clientSecret'),
      connectorId: target.getString('connectorId'),
      scopes: target.getString('scopes'),
    });
  }
  return targets;
}

/**
 * Extracts the OAuth 2.0 `error` code (RFC 6749 section 5.2) from a broker
 * error response body. Returns undefined for non-JSON bodies (e.g. an HTML
 * error page from a proxy sitting in front of the broker).
 */
function parseOAuthError(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : undefined;
  } catch {
    return undefined;
  }
}

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
 * per-management-cluster token (RFC 8693 token exchange) and caches it per
 * (user, installation) with expiry-aware re-exchange. An installation with an
 * entry under `gs.clusterTokenBroker.targets` is exchanged at its own Dex;
 * every other one at the muster broker (`gs.clusterTokenBroker.tokenUrl`),
 * when one is configured. Exchanged tokens are returned to the frontend as
 * short-lived credentials and are never persisted.
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

  const musterTokenUrl = brokerConfig.getOptionalString('tokenUrl');
  const muster: TokenEndpoint | undefined = musterTokenUrl
    ? {
        kind: 'muster',
        tokenUrl: musterTokenUrl,
        clientId: brokerConfig.getString('clientId'),
        clientSecret: brokerConfig.getString('clientSecret'),
      }
    : undefined;
  const scope = brokerConfig.getOptionalString('scope');
  const dexTargets = readDexTargets(brokerConfig);
  if (!muster && dexTargets.size === 0) {
    throw new Error(
      "gs.clusterTokenBroker needs a tokenUrl (the muster broker) or at least one entry under targets (an installation's own Dex)",
    );
  }

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

      const dexTarget = dexTargets.get(installation);
      const endpoint = dexTarget ?? muster;
      if (!endpoint) {
        throw new NotFoundError(
          `Installation "${installation}" has no cluster token broker target`,
        );
      }

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
      });
      if (dexTarget) {
        // Dex picks the upstream by connector_id and ignores `audience`; the
        // audience of the issued id_token comes from the cross-client scope.
        // An id_token, since Dex's default access token is opaque to the
        // kube-apiserver.
        params.set('connector_id', dexTarget.connectorId);
        params.set('scope', dexTarget.scopes);
        params.set('requested_token_type', ID_TOKEN_TYPE);
      } else {
        params.set('audience', audience);
        if (scope) {
          params.set('scope', scope);
        }
      }

      let response: Response;
      try {
        response = await fetch(endpoint.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(
              `${endpoint.clientId}:${endpoint.clientSecret}`,
            ).toString('base64')}`,
          },
          body: params.toString(),
        });
      } catch (error) {
        // A broker fault, not a user problem. Keep the installation out of the
        // message so the winston->Sentry bridge groups every installation's
        // outage into a single issue instead of one per installation.
        logger.warn('Cluster token exchange failed: token broker unreachable', {
          installation,
          broker: endpoint.kind,
          error: String(error),
          // undici puts the actionable code (ECONNREFUSED/ENOTFOUND) on
          // error.cause; String(error) alone collapses to "TypeError: fetch
          // failed", which would make every outage cause look identical.
          cause:
            error instanceof Error && error.cause !== undefined
              ? String(error.cause)
              : null,
        });
        res.status(502).json({
          error: 'Token broker is unreachable',
          reason: 'broker_unreachable',
        });
        return;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        tokenCache.delete(cacheKey);

        const oauthError = parseOAuthError(body);

        // The high-cardinality installation and raw body go into structured
        // metadata, never the log message. The Sentry transport fingerprints
        // `warn`/`error` on the message text, so a constant message per root
        // cause collapses a broker fault into one Sentry issue rather than one
        // per installation.
        const meta = {
          installation,
          broker: endpoint.kind,
          status: response.status,
          oauthError: oauthError ?? null,
          body,
        };

        // OAuth `invalid_client` means the portal could not authenticate
        // ITSELF to the broker (e.g. its confidential client record in muster
        // was wiped, or the Dex target's client secret is wrong),
        // not that the user's subject token was rejected. This is a broker
        // outage that hits every cluster at once and must not be reported to
        // users as an expired session. Genuinely actionable -> stays at `warn`.
        if (oauthError === 'invalid_client') {
          logger.warn(
            'Cluster token exchange failed: portal could not authenticate to the broker (invalid_client)',
            meta,
          );
          res.status(502).json({
            error: 'Token exchange failed',
            reason: 'broker_client_invalid',
          });
          return;
        }

        // A 503, or the RFC 6749 `temporarily_unavailable` / muster's
        // `service_unavailable`, means the broker could not serve the request
        // for a moment (its token store unreachable, OIDC discovery pending
        // after a restart), not that it rejected the exchange. It hits every
        // installation at once and clears by itself, so it gets its own
        // message: one Sentry issue per broker outage, apart from genuine
        // rejections.
        const brokerUnavailable =
          response.status === 503 ||
          oauthError === 'temporarily_unavailable' ||
          oauthError === 'service_unavailable';
        if (brokerUnavailable) {
          logger.warn(
            'Cluster token exchange failed: token broker temporarily unavailable',
            meta,
          );
          res.status(502).json({
            error: 'Token broker is temporarily unavailable',
            reason: 'broker_unavailable',
          });
          return;
        }

        // An OAuth invalid_grant/invalid_token/invalid_request (or a bare 401
        // that is not invalid_client) means the forwarded subject token was
        // rejected -- i.e. the user's main session, not the cluster, is the
        // problem. This is routine (expired sessions) and already handled with
        // 0 user impact, so it logs at `debug` and stays out of Sentry.
        const subjectRejected =
          response.status === 401 ||
          oauthError === 'invalid_grant' ||
          oauthError === 'invalid_token' ||
          oauthError === 'invalid_request';
        if (subjectRejected) {
          logger.debug(
            'Cluster token exchange rejected: subject token invalid or expired',
            meta,
          );
          res.status(502).json({
            error: 'Token exchange failed',
            reason: 'subject_invalid',
          });
          return;
        }

        // Everything else is a broker-side exchange failure -- e.g.
        // `invalid_target`, where the audience/installation is not served by
        // the broker (a registration/config gap). Actionable -> stays at `warn`.
        logger.warn(
          'Cluster token exchange failed: broker rejected the exchange',
          meta,
        );
        res.status(502).json({
          error: 'Token exchange failed',
          reason: 'exchange_failed',
        });
        return;
      }

      const tokenResponse = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (!tokenResponse.access_token) {
        logger.warn(
          'Cluster token exchange failed: broker returned no access_token',
          { installation, broker: endpoint.kind },
        );
        res
          .status(502)
          .json({ error: 'Token exchange failed', reason: 'exchange_failed' });
        return;
      }

      const expiresInSeconds =
        tokenResponse.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS;
      tokenCache.set(cacheKey, {
        token: tokenResponse.access_token,
        expiresAt: now + expiresInSeconds * 1000,
      });

      logger.debug(
        `Minted cluster token for ${userEntityRef} on installation "${installation}" (${
          dexTarget ? `Dex ${dexTarget.tokenUrl}` : `audience "${audience}"`
        }, expires in ${expiresInSeconds}s)`,
      );

      res.json({ token: tokenResponse.access_token, expiresInSeconds });
    },
  );

  return router;
}
