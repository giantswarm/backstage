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
 * Hive's epic page (`/hive/epics/:id`), where every board item opens when
 * the plans plugin is enabled; unbound otherwise (the item opens in
 * `itemRouteRef`).
 */
export const epicPageExternalRouteRef = createExternalRouteRef({
  params: ['id'],
  defaultTarget: 'plans.epic',
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
