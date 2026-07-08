import {
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const itemRouteRef = createSubRouteRef({
  path: '/item/:itemId',
  parent: rootRouteRef,
});
