import {
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const overviewSubRouteRef = createSubRouteRef({
  path: '/tree',
  parent: rootRouteRef,
});

export const resourcesSubRouteRef = createSubRouteRef({
  path: '/list',
  parent: rootRouteRef,
});
