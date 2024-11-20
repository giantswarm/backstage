import {
  AuthProviderFactory,
  OAuthEnvironmentHandler,
} from '@backstage/plugin-auth-node';
import { createAuthRouteHandlers } from './createAuthRouteHandlers';

export function createAuthProviderFactory(): AuthProviderFactory {
  return ctx => {
    return OAuthEnvironmentHandler.mapConfig(ctx.config, envConfig => {
      return createAuthRouteHandlers({
        appUrl: ctx.appUrl,
        baseUrl: ctx.baseUrl,
        config: envConfig,
        isOriginAllowed: ctx.isOriginAllowed,
        cookieConfigurer: ctx.cookieConfigurer,
        providerId: ctx.providerId,
      });
    });
  };
}
