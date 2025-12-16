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
});

export const AiChatPage = aiChatPlugin.provide(
  createRoutableExtension({
    name: 'AiChatPage',
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);
