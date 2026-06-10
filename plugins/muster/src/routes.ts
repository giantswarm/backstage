import {
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const workflowDetailRouteRef = createSubRouteRef({
  path: '/workflows/:name',
  parent: rootRouteRef,
});
