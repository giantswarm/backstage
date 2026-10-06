import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

/** The board: Hive's Board tab (`/hive/board`). */
export const rootRouteRef = createRouteRef();

/** The old Roadmap page (`/roadmap`), now a redirect into Hive. */
export const legacyRootRouteRef = createRouteRef();

export const itemRouteRef = createSubRouteRef({
  path: '/items/:id',
  parent: rootRouteRef,
});

/**
 * The plans plugin's pages: Hive's front page, where an old item link opens
 * the epic in place, and a plan's review, for linking an epic to the plan
 * that implements it. Resolve automatically when the plans plugin is
 * enabled; unbound otherwise (the panel then simply renders nothing).
 */
export const plansRootExternalRouteRef = createExternalRouteRef({
  defaultTarget: 'plans.root',
});

export const plansPullExternalRouteRef = createExternalRouteRef({
  params: ['number'],
  defaultTarget: 'plans.pull',
});
