import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { entityDeploymentsRouteRef, rootRouteRef } from './routes';
import { withQueryClient } from './withQueryClient';

export const gsPlugin = createPlugin({
  id: 'gs',
  routes: {
    root: rootRouteRef,
    entityContent: entityDeploymentsRouteRef,
  },
});

export const GSPluginPage = gsPlugin.provide(
  createRoutableExtension({
    name: 'GSPluginPage',
    component: () =>
      import('./components/PluginPage').then(m => withQueryClient(m.PluginPage)),
    mountPoint: rootRouteRef,
  }),
);

export const EntityGSDeploymentsContent = gsPlugin.provide(
  createRoutableExtension({
    name: 'EntityGSDeploymentsContent',
    component: () => import('./components/Router').then(m => withQueryClient(m.Router)),
    mountPoint: entityDeploymentsRouteRef,
  }),
);
