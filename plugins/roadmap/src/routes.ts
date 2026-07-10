import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const itemRouteRef = createSubRouteRef({
  path: '/items/:id',
  parent: rootRouteRef,
});

/**
 * The plans plugin's pages, for linking an epic to the plan that implements
 * it. Resolve automatically when the plans plugin is enabled; unbound
 * otherwise (the panel then simply renders nothing).
 */
export const plansRootExternalRouteRef = createExternalRouteRef({
  defaultTarget: 'plans.root',
});

export const plansPullExternalRouteRef = createExternalRouteRef({
  params: ['number'],
  defaultTarget: 'plans.pull',
});
