import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import AccountTreeIcon from '@material-ui/icons/AccountTree';

import { musterApiRef, MusterApiClient } from './apis';
import { rootRouteRef, workflowDetailRouteRef } from './routes';

const musterPage = PageBlueprint.make({
  params: {
    title: 'Workflows',
    icon: <AccountTreeIcon />,
    path: '/muster',
    routeRef: rootRouteRef,
    loader: () => import('./components/Router').then(m => <m.Router />),
  },
});

const musterApi = ApiBlueprint.make({
  name: 'muster',
  params: defineParams =>
    defineParams({
      api: musterApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new MusterApiClient({ discoveryApi, fetchApi }),
    }),
});

export const musterPlugin = createFrontendPlugin({
  pluginId: 'muster',
  extensions: [musterPage, musterApi],
  routes: {
    root: rootRouteRef,
    workflowDetail: workflowDetailRouteRef,
  },
});
