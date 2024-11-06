import { InputError, isError, NotAllowedError } from '@backstage/errors';
import {
  AuthProviderRouteHandlers,
  CookieConfigurer,
  decodeOAuthState,
  encodeOAuthState,
  sendWebMessageResponse,
} from '@backstage/plugin-auth-node';
import express from 'express';
import crypto from 'crypto';
import { Config } from '@backstage/config';
import { OAuthCookieManager } from './OAuthCookieManager';

export interface AuthRouteHandlersOptions {
  appUrl: string;
  baseUrl: string;
  isOriginAllowed: (origin: string) => boolean;
  providerId: string;
  config: Config;
  additionalScopes?: string[];
  cookieConfigurer?: CookieConfigurer;
}

export function createAuthRouteHandlers(
  options: AuthRouteHandlersOptions,
): AuthProviderRouteHandlers {
  const {
    config,
    baseUrl,
    appUrl,
    providerId,
    isOriginAllowed,
    cookieConfigurer,
  } = options;

  const defaultAppOrigin = new URL(appUrl).origin;
  const callbackUrl =
    config.getOptionalString('callbackUrl') ??
    `${baseUrl}/${providerId}/handler/frame`;

  const cookieManager = new OAuthCookieManager({
    baseUrl,
    callbackUrl,
    defaultAppOrigin,
    providerId,
    cookieConfigurer,
  });

  return {
    async start(
      this: never,
      req: express.Request,
      res: express.Response,
    ): Promise<void> {
      const env = req.query.env?.toString();
      const origin = req.query.origin?.toString();
      const redirectUrl = req.query.redirectUrl?.toString();
      if (!redirectUrl) {
        throw new InputError(
          'No redirectUrl provided in request query parameters',
        );
      }
      if (!env) {
        throw new InputError('No env provided in request query parameters');
      }

      const nonce = crypto.randomBytes(16).toString('base64');
      cookieManager.setNonce(res, nonce, origin);

      const state = { nonce, env, origin };

      const url = new URL(redirectUrl);
      url.searchParams.set('state', encodeOAuthState(state));

      res.statusCode = 302;
      res.setHeader('Location', url.toString());
      res.setHeader('Content-Length', '0');
      res.end();
    },

    async frameHandler(
      this: never,
      req: express.Request,
      res: express.Response,
    ): Promise<void> {
      let origin = defaultAppOrigin;

      try {
        const state = decodeOAuthState(req.query.state?.toString() ?? '');

        if (state.origin) {
          try {
            origin = new URL(state.origin).origin;
          } catch {
            throw new NotAllowedError('App origin is invalid, failed to parse');
          }
          if (!isOriginAllowed(origin)) {
            throw new NotAllowedError(`Origin '${origin}' is not allowed`);
          }
        }

        const cookieNonce = cookieManager.getNonce(req);
        const stateNonce = state.nonce;
        if (!cookieNonce) {
          throw new NotAllowedError('Auth response is missing cookie nonce');
        }
        if (cookieNonce !== stateNonce) {
          throw new NotAllowedError('Invalid nonce');
        }

        const response = {
          providerInfo: {},
          profile: {},
          code: req.query.code?.toString(),
        };

        sendWebMessageResponse(res, origin, {
          type: 'authorization_response',
          response,
        });
      } catch (error) {
        const { name, message } = isError(error)
          ? error
          : new Error('Encountered invalid error');
        sendWebMessageResponse(res, origin, {
          type: 'authorization_response',
          error: { name, message },
        });
      }
    },
  };
}
