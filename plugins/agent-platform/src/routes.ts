import {
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const newAgentRouteRef = createSubRouteRef({
  path: '/new',
  parent: rootRouteRef,
});

export const newAgentReviewRouteRef = createSubRouteRef({
  path: '/new/review',
  parent: rootRouteRef,
});
