import express from 'express';
import Router from 'express-promise-router';
import {
  HttpAuthService,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { MusterServerGateway } from '@giantswarm/backstage-plugin-gs-node';
import { SUBJECT_TOKEN_HEADER } from '../clusterToken/router';

const TOKEN_EXCHANGE_GRANT_TYPE =
  'urn:ietf:params:oauth:grant-type:token-exchange';
const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token';

/**
 * Minimum remaining lifetime before a cached token is re-exchanged. Larger
 * than the frontend's 3-minute session refresh margin (OAuth2's
 * sessionShouldRefresh) and smaller than muster's 5-minute grant refresh
 * margin, so a re-exchange never hands out a token the frontend refreshes
 * again at once, and muster has refreshed the grant by the time we ask.
 */
const EXPIRY_SKEW_SECONDS = 240;

/** Fallback lifetime when the broker response carries no expires_in. */
const DEFAULT_EXPIRES_IN_SECONDS = 300;

type CachedToken = {
  token: string;
  expiresAt: number;
};

function parseOAuthError(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : undefined;
  } catch {
    return undefined;
  }
}

export interface GithubTokenRouterOptions {
  config: RootConfigService;
  logger: LoggerService;
  httpAuth: HttpAuthService;
  /**
   * The muster server the grant belongs to (`gs.github.muster`): asked for
   * the connect URL when the person holds no grant, and signed out of on
   * logout. Built by the module from config; tests pass a fake.
   */
  github: MusterServerGateway;
}

/**
 * Creates the GitHub token router, exposed as `POST /api/auth/github-token`
 * and `POST /api/auth/github-token/logout`. Backs the frontend's standard
 * GitHub auth API (`githubAuthApiRef`) with the person's own GitHub grant in
 * muster, so the portal holds no GitHub App and runs no GitHub login.
 *
 * Given the caller's Backstage session and their main Dex ID token
 * (`gs-subject-token`), the token route exchanges the ID token through the
 * muster token broker (RFC 8693, `gs.clusterTokenBroker` credentials,
 * audience `gs.github.brokerAudience`) and gets the access token of the
 * person's GitHub grant with its remaining lifetime -- never the refresh
 * token, which stays in muster. Tokens are cached per user with
 * expiry-aware re-exchange and never persisted. A person without a grant
 * gets 401 with `reason: no_grant` and muster's connect URL (from
 * `core_auth_login` on `gs.github.muster`), which the frontend turns into a
 * silent full-page bounce. Broker faults are 502 like the cluster-token
 * route. The logout route runs `core_auth_logout` on the server, which
 * revokes the grant for every session and every server of that issuer.
 *
 * Returns undefined when `gs.github` is not configured.
 */
export function createGithubTokenRouter(
  options: GithubTokenRouterOptions,
): express.Router | undefined {
  const { config, logger, httpAuth, github } = options;

  const githubConfig = config.getOptionalConfig('gs.github');
  if (!githubConfig) {
    return undefined;
  }
  const brokerConfig = config.getOptionalConfig('gs.clusterTokenBroker');
  if (!brokerConfig) {
    throw new Error(
      'gs.github is configured but gs.clusterTokenBroker is not: the GitHub token is released through the muster token broker and needs its credentials',
    );
  }

  const tokenUrl = brokerConfig.getString('tokenUrl');
  const clientId = brokerConfig.getString('clientId');
  const clientSecret = brokerConfig.getString('clientSecret');
  const audience = githubConfig.getString('brokerAudience');

  const tokenCache = new Map<string, CachedToken>();

  const pruneExpired = (now: number) => {
    for (const [key, value] of tokenCache) {
      if (value.expiresAt <= now) {
        tokenCache.delete(key);
      }
    }
  };

  const router = Router();

  /** The caller's Backstage user and their Dex ID token, or 400/401. */
  const caller = async (req: express.Request) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const subjectToken = req.header(SUBJECT_TOKEN_HEADER);
    if (!subjectToken) {
      throw new InputError(`Missing ${SUBJECT_TOKEN_HEADER} header`);
    }
    return { userEntityRef: credentials.principal.userEntityRef, subjectToken };
  };

  /**
   * No grant: ask muster to connect the server for the caller. A person who
   * consented before is connected on the spot (then the exchange is retried
   * once); otherwise the answer carries muster's connect URL.
   */
  const notConnected = async (
    res: express.Response,
    subjectToken: string,
    retry: () => Promise<void>,
  ) => {
    let login: Awaited<ReturnType<MusterServerGateway['login']>>;
    try {
      login = await github.login(subjectToken);
    } catch (error) {
      logger.warn(
        'GitHub token: the broker released no grant and muster could not be asked to connect',
        { server: github.server, error: String(error) },
      );
      res.status(502).json({
        error: 'GitHub is not connected and muster is unreachable',
        reason: 'exchange_failed',
      });
      return;
    }
    if (login.status === 'connected') {
      await retry();
      return;
    }
    if (login.status === 'auth_required') {
      res.status(401).json({
        error: `Connect GitHub in muster (server '${github.server}') to use this page.`,
        reason: 'no_grant',
        server: github.server,
        authUrl: login.authUrl,
      });
      return;
    }
    logger.warn('GitHub token: muster refused to connect the server', {
      server: github.server,
      status: login.status,
      message: login.message,
    });
    res.status(502).json({
      error: `'${github.server}' is not connected: ${login.message}`,
      reason: 'exchange_failed',
      server: github.server,
    });
  };

  router.post('/github-token', async (req, res) => {
    const { userEntityRef, subjectToken } = await caller(req);
    res.setHeader('Cache-Control', 'no-store');

    const now = Date.now();
    pruneExpired(now);

    const cached = tokenCache.get(userEntityRef);
    if (cached && cached.expiresAt - now > EXPIRY_SKEW_SECONDS * 1000) {
      res.json({
        token: cached.token,
        expiresInSeconds: Math.floor((cached.expiresAt - now) / 1000),
      });
      return;
    }

    const exchange = async (afterConnect: boolean): Promise<void> => {
      const params = new URLSearchParams({
        grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
        subject_token: subjectToken,
        subject_token_type: ID_TOKEN_TYPE,
        audience,
      });

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
        logger.warn('GitHub token exchange failed: token broker unreachable', {
          error: String(error),
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
        tokenCache.delete(userEntityRef);
        const oauthError = parseOAuthError(body);
        const meta = {
          status: response.status,
          oauthError: oauthError ?? null,
          body,
        };

        if (oauthError === 'invalid_client') {
          logger.warn(
            'GitHub token exchange failed: broker could not authenticate to muster (invalid_client)',
            meta,
          );
          res.status(502).json({
            error: 'Token exchange failed',
            reason: 'broker_client_invalid',
          });
          return;
        }

        // muster answers invalid_target both for a person without a grant and
        // for an audience the broker does not serve; muster's own login for
        // the server tells the two apart (a grant that exists connects).
        if (oauthError === 'invalid_target') {
          if (afterConnect) {
            logger.warn(
              'GitHub token exchange failed: the broker refused the audience although muster connected the server (is the grant target configured?)',
              { ...meta, audience, server: github.server },
            );
            res.status(502).json({
              error: 'Token exchange failed',
              reason: 'exchange_failed',
            });
            return;
          }
          await notConnected(res, subjectToken, () => exchange(true));
          return;
        }

        const subjectRejected =
          response.status === 401 ||
          oauthError === 'invalid_grant' ||
          oauthError === 'invalid_token' ||
          oauthError === 'invalid_request';
        if (subjectRejected) {
          logger.debug(
            'GitHub token exchange rejected: subject token invalid or expired',
            meta,
          );
          res.status(502).json({
            error: 'Token exchange failed',
            reason: 'subject_invalid',
          });
          return;
        }

        logger.warn(
          'GitHub token exchange failed: broker rejected the exchange',
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
          'GitHub token exchange failed: broker returned no access_token',
        );
        res
          .status(502)
          .json({ error: 'Token exchange failed', reason: 'exchange_failed' });
        return;
      }

      const expiresInSeconds =
        tokenResponse.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS;
      tokenCache.set(userEntityRef, {
        token: tokenResponse.access_token,
        expiresAt: Date.now() + expiresInSeconds * 1000,
      });

      logger.debug(
        `Minted GitHub token for ${userEntityRef} (audience "${audience}", expires in ${expiresInSeconds}s)`,
      );
      res.json({ token: tokenResponse.access_token, expiresInSeconds });
    };

    await exchange(false);
  });

  router.post('/github-token/logout', async (req, res) => {
    const { userEntityRef, subjectToken } = await caller(req);
    res.setHeader('Cache-Control', 'no-store');
    tokenCache.delete(userEntityRef);
    const message = await github.logout(subjectToken);
    logger.info(`Signed ${userEntityRef} out of GitHub in muster`, {
      server: github.server,
    });
    res.json({ signedOut: true, message });
  });

  return router;
}
