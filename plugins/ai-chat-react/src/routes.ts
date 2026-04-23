import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({ id: 'ai-chat' });

export const historyRouteRef = createSubRouteRef({
  id: 'ai-chat/history',
  parent: rootRouteRef,
  path: '/history',
});
