import {
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const pullRouteRef = createSubRouteRef({
  path: '/pr/:number',
  parent: rootRouteRef,
});
