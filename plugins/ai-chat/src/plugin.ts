import {
  createApiFactory,
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { mcpAuthProvidersApiRef, MCPAuthProviders } from './api';
import { rootRouteRef } from './routes';

export const aiChatPlugin = createPlugin({
  id: 'ai-chat',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: mcpAuthProvidersApiRef,
      deps: {},
      factory: () => new MCPAuthProviders(),
    }),
  ],
  featureFlags: [
    {
      name: 'ai-chat-verbose-debugging',
    },
  ],
});

export const AiChatPage = aiChatPlugin.provide(
  createRoutableExtension({
    name: 'AiChatPage',
    component: () => import('./components/AiChat').then(m => m.AiChatPage),
    mountPoint: rootRouteRef,
  }),
);
