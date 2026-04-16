import {
  createServiceFactory,
  coreServices,
} from '@backstage/backend-plugin-api';
import { DefaultHttpAuthService } from '@backstage/backend-defaults/httpAuth';

/**
 * Custom httpAuth service factory that reads the Backstage identity token
 * from the `X-Backstage-Token` header, falling back to the standard
 * `Authorization: Bearer` header.
 *
 * This avoids conflicts when an external proxy (e.g. nginx ingress) uses
 * Basic auth on the `Authorization` header.
 */
export const customHttpAuthServiceFactory = createServiceFactory({
  service: coreServices.httpAuth,
  deps: {
    auth: coreServices.auth,
    discovery: coreServices.discovery,
    plugin: coreServices.pluginMetadata,
  },
  factory({ auth, discovery, plugin }) {
    return DefaultHttpAuthService.create({
      auth,
      discovery,
      pluginId: plugin.getId(),
      getTokenFromRequest(req) {
        // Try custom header first (set by the frontend fetchApi middleware)
        const customHeader = req.headers['x-backstage-token'];
        if (typeof customHeader === 'string') {
          const matches = customHeader.match(/^Bearer[ ]+(\S+)$/i);
          if (matches?.[1]) {
            return { token: matches[1] };
          }
        }

        // Fall back to standard Authorization: Bearer header
        const authHeader = req.headers.authorization;
        if (typeof authHeader === 'string') {
          const matches = authHeader.match(/^Bearer[ ]+(\S+)$/i);
          if (matches?.[1]) {
            return { token: matches[1] };
          }
        }

        return { token: undefined };
      },
    });
  },
});
