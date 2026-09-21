import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

/**
 * agentPlatformPlugin backend plugin
 *
 * The Agent Platform frontend's door to kagent: a JSON/SSE surface for the
 * browser over a native gRPC client of each installation's kagent API v2
 * controller (`AgentInstanceService`, `AgentTemplateService`, `SystemService`
 * and the A2A v1 `A2AService`), plus one try of a served model against the
 * installation's models Gateway (everything else about models goes through
 * muster as the person), plus the agents' avatars proxied from each
 * installation's avatars host so the browser loads them same-origin.
 *
 * It exists because the browser cannot reach `agentgateway.<baseDomain>`
 * cross-origin, because gRPC over HTTP/2 wants a server-side client, and
 * because the user's per-installation Dex ID token has to *become* the
 * `authorization` metadata toward kagent (on the inbound leg that header
 * carries the Backstage identity instead).
 *
 * @public
 */
export const agentPlatformPlugin = createBackendPlugin({
  pluginId: 'agent-platform',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        lifecycle: coreServices.rootLifecycle,
      },
      async init({ httpRouter, logger, config, lifecycle }) {
        // Agent avatars are `<img>` loads, which carry no bearer token: this
        // path alone accepts the plugin's user cookie (issued to the browser
        // at `/.backstage/auth/v1/cookie` by the frontend's
        // CookieAuthRefreshProvider). Never unauthenticated — the route
        // fetches from the installations' hosts on the person's behalf.
        httpRouter.addAuthPolicy({ path: '/avatars', allow: 'user-cookie' });
        httpRouter.use(
          await createRouter({
            logger,
            config,
            lifecycle,
          }),
        );
      },
    });
  },
});
