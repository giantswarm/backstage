import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

/**
 * The plans: Hive's Plans tab (`/hive/plans`), so a plan review
 * (`pullRouteRef`) opens inside Hive.
 */
export const rootRouteRef = createRouteRef();

/** The Hive section (`/hive`) and its tabs. */
export const hiveRouteRef = createRouteRef();
export const hiveNowRouteRef = createRouteRef();
export const hiveHistoryRouteRef = createRouteRef();
export const hiveKnowledgeRouteRef = createRouteRef();

/** The old Plans page (`/plans`), now a redirect into Hive. */
export const legacyPlansRouteRef = createRouteRef();

/** The old product magazine page (`/product`), now a redirect into Hive. */
export const magazineRouteRef = createRouteRef();

export const pullRouteRef = createSubRouteRef({
  path: '/pr/:number',
  parent: rootRouteRef,
});

/**
 * The roadmap plugin's item detail page, for linking a plan's epic chip to
 * the epic's board view. Resolves automatically when the roadmap plugin is
 * enabled; unbound otherwise (the chip falls back to the GitHub issue).
 */
export const roadmapItemExternalRouteRef = createExternalRouteRef({
  params: ['id'],
  defaultTarget: 'roadmap.item',
});
