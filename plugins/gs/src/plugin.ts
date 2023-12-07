import {
  configApiRef,
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
} from '@backstage/core-plugin-api';

import { entityDeploymentsRouteRef, rootRouteRef } from './routes';
import { GSClient, gsApiRef } from './apis';
import { scmAuthApiRef } from '@backstage/integration-react';

export const gsPlugin = createPlugin({
  id: 'gs',
  apis: [
    createApiFactory({
      api: gsApiRef,
      deps: { configApi: configApiRef, discoveryApi: discoveryApiRef, scmAuthApi: scmAuthApiRef },
      factory: ({ configApi, discoveryApi, scmAuthApi }) =>
        new GSClient({ configApi, discoveryApi, scmAuthApi }),
    }),
  ],
  routes: {
    root: rootRouteRef,
    entityContent: entityDeploymentsRouteRef,
  },
});

export const GSPluginPage = gsPlugin.provide(
  createRoutableExtension({
    name: 'GSPluginPage',
    component: () =>
      import('./components/PluginPage').then(m => m.PluginPage),
    mountPoint: rootRouteRef,
  }),
);

export const EntityGSDeploymentsContent = gsPlugin.provide(
  createRoutableExtension({
    name: 'EntityGSDeploymentsContent',
    component: () => import('./components/EntityDeploymentsContent').then(m => m.EntityDeploymentsContent),
    mountPoint: entityDeploymentsRouteRef,
  }),
);
