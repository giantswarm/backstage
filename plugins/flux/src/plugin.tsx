import {
  createFrontendPlugin,
  NavItemBlueprint,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';

import { FluxIcon } from '@giantswarm/backstage-plugin-flux-react';

import {
  rootRouteRef,
  resourcesSubRouteRef,
  overviewSubRouteRef,
} from './routes';

const fluxNavItem = NavItemBlueprint.make({
  params: {
    title: 'Flux',
    icon: FluxIcon,
    routeRef: rootRouteRef,
  },
});

const fluxPage = PageBlueprint.make({
  params: {
    path: '/flux',
    loader: () => import('./components/FluxPage').then(m => <m.FluxPage />),
    routeRef: rootRouteRef,
  },
});

export const fluxPlugin = createFrontendPlugin({
  pluginId: 'flux',
  extensions: [fluxPage, fluxNavItem],
  routes: {
    root: rootRouteRef,
    overview: overviewSubRouteRef,
    resources: resourcesSubRouteRef,
  },
});
