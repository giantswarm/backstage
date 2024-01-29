import React from 'react';
import {
  createNavItemExtension,
  createPageExtension,
  createPlugin,
} from '@backstage/frontend-plugin-api';
import {
  convertLegacyRouteRef,
  convertLegacyRouteRefs,
  compatWrapper,
} from '@backstage/core-compat-api';
import { GiantSwarmIcon } from './assets/icons/CustomIcons';

import { rootRouteRef } from './routes';

const clustersPage = createPageExtension({
  defaultPath: '/clusters',
  routeRef: convertLegacyRouteRef(rootRouteRef),
  loader: () =>
    import('./components/PluginPage').then(m =>
      compatWrapper(
        <m.PluginPage />
      ),
    ),
});

/** @alpha */
export const clustersNavItem = createNavItemExtension({
  routeRef: convertLegacyRouteRef(rootRouteRef),
  title: 'Clusters',
  icon: GiantSwarmIcon,
});

/**
 * @alpha
 */
export default createPlugin({
  id: 'gs',
  extensions: [clustersPage, clustersNavItem],
  routes: convertLegacyRouteRefs({
    root: rootRouteRef,
  }),
});
