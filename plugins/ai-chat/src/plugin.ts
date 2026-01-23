import {
  configApiRef,
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  oauthRequestApiRef,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';
import { mcpAuthApiRef, MCPAuthProviders } from './api';

export const aiChatPlugin = createPlugin({
  id: 'ai-chat',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: mcpAuthApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        oauthRequestApi: oauthRequestApiRef,
      },
      factory: ({ configApi, discoveryApi, oauthRequestApi }) =>
        MCPAuthProviders.create({
          configApi,
          discoveryApi,
          oauthRequestApi,
        }),
    }),
  ],
});

export const AiChatPage = aiChatPlugin.provide(
  createRoutableExtension({
    name: 'AiChatPage',
    component: () => import('./components/AiChat').then(m => m.AiChatPage),
    mountPoint: rootRouteRef,
  }),
);
