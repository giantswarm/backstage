import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const aiChatPlugin = createPlugin({
  id: 'ai-chat',
  routes: {
    root: rootRouteRef,
  },
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
