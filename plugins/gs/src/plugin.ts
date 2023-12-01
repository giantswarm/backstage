import {
  configApiRef,
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
} from '@backstage/core-plugin-api';

import { entityDeployedToRouteRef, rootRouteRef } from './routes';
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
    entityContent: entityDeployedToRouteRef,
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

export const EntityGSDeployedToContent = gsPlugin.provide(
  createRoutableExtension({
    name: 'EntityGSDeployedToContent',
    component: () => import('./components/EntityDeployedToContent').then(m => m.EntityDeployedToContent),
    mountPoint: entityDeployedToRouteRef,
  }),
);
