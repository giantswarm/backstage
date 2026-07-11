import express from 'express';
import Router from 'express-promise-router';
import {
  HttpAuthService,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import {
  DEFAULT_EXPIRES_IN_SECONDS,
  ID_TOKEN_TYPE,
  parseOAuthError,
  SUBJECT_TOKEN_HEADER,
  TOKEN_EXCHANGE_GRANT_TYPE,
  TokenExchangeCache,
} from '../tokenExchange/tokenExchange';

export { SUBJECT_TOKEN_HEADER } from '../tokenExchange/tokenExchange';

export interface MusterTokenRouterOptions {
  config: RootConfigService;
  logger: LoggerService;
  httpAuth: HttpAuthService;
}

/**
 * Creates the muster token service router, exposed as
 * `POST /api/auth/muster-token`.
 *
 * Given the caller's authenticated Backstage session and their main Dex ID
 * token (forwarded in the `gs-subject-token` header), it mints a short-lived
 * muster-signed session token through muster's self-issued RFC 8693 exchange
 * (no `audience`, no client authentication) and caches it per user with
 * expiry-aware re-exchange. The token replaces the raw Dex ID token as the
 * MCP bearer so that muster's outbound exchange, which only accepts a
 * muster-signed subject, succeeds. Exchanged tokens are never persisted.
 *
 * Returns undefined when muster's token endpoint is not configured
 * (`gs.musterToken`).
 */
export function createMusterTokenRouter(
  options: MusterTokenRouterOptions,
): express.Router | undefined {
  const { config, logger, httpAuth } = options;

  const musterTokenConfig = config.getOptionalConfig('gs.musterToken');
  if (!musterTokenConfig) {
    return undefined;
  }

  const tokenUrl = musterTokenConfig.getString('tokenUrl');
  const scope = musterTokenConfig.getOptionalString('scope');

  const tokenCache = new TokenExchangeCache();

  const router = Router();

  router.post(
    '/muster-token',
    async (req: express.Request, res: express.Response) => {
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const userEntityRef = credentials.principal.userEntityRef;

      const subjectToken = req.header(SUBJECT_TOKEN_HEADER);
      if (!subjectToken) {
        throw new InputError(`Missing ${SUBJECT_TOKEN_HEADER} header`);
      }

      res.setHeader('Cache-Control', 'no-store');

      const now = Date.now();
      const cached = tokenCache.getFresh(userEntityRef, now);
      if (cached) {
        res.json(cached);
        return;
      }

      // Self-issued path: no `audience` (an audience routes muster to the
      // brokered exchange) and no client authentication.
      const params = new URLSearchParams({
        grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
        subject_token: subjectToken,
        subject_token_type: ID_TOKEN_TYPE,
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
          },
          body: params.toString(),
        });
      } catch (error) {
        logger.warn('Muster token exchange failed: muster unreachable', {
          error: String(error),
          // undici puts the actionable code (ECONNREFUSED/ENOTFOUND) on
          // error.cause; String(error) alone collapses to "TypeError: fetch
          // failed".
          cause:
            error instanceof Error && error.cause !== undefined
              ? String(error.cause)
              : null,
        });
        res.status(502).json({
          error: 'Muster is unreachable',
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

        // An OAuth invalid_grant/invalid_token/invalid_request (or a bare 401)
        // means the forwarded subject token was rejected, i.e. the user's main
        // session is the problem. This is routine (expired sessions), handled
        // with 0 user impact, so it logs at `debug` and stays out of Sentry.
        const subjectRejected =
          response.status === 401 ||
          oauthError === 'invalid_grant' ||
          oauthError === 'invalid_token' ||
          oauthError === 'invalid_request';
        if (subjectRejected) {
          logger.debug(
            'Muster token exchange rejected: subject token invalid or expired',
            meta,
          );
          res.status(502).json({
            error: 'Token exchange failed',
            reason: 'subject_invalid',
          });
          return;
        }

        // Everything else is a muster-side exchange failure, e.g. the subject
        // issuer is not in muster's trustedIssuers (a config gap). Actionable,
        // stays at `warn`.
        logger.warn(
          'Muster token exchange failed: muster rejected the exchange',
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
          'Muster token exchange failed: muster returned no access_token',
        );
        res
          .status(502)
          .json({ error: 'Token exchange failed', reason: 'exchange_failed' });
        return;
      }

      const expiresInSeconds =
        tokenResponse.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS;
      tokenCache.set(
        userEntityRef,
        tokenResponse.access_token,
        expiresInSeconds,
        now,
      );

      logger.debug(
        `Minted muster token for ${userEntityRef} (expires in ${expiresInSeconds}s)`,
      );

      res.json({ token: tokenResponse.access_token, expiresInSeconds });
    },
  );

  return router;
}
