import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

/**
 * Hive (`/hive`): the front page, read top to bottom for a moment in time
 * (`?when=`), with the board and the knowledge as secondary tabs. The
 * plugin's root, so the page header's title links back to it.
 */
export const rootRouteRef = createRouteRef();

/** Hive's knowledge reader (`/hive/knowledge`). */
export const hiveKnowledgeRouteRef = createRouteRef();

/** The old Plans page (`/plans`), now a redirect into Hive. */
export const legacyPlansRouteRef = createRouteRef();

/** The old product magazine page (`/product`), now a redirect into Hive. */
export const magazineRouteRef = createRouteRef();

/**
 * A plan's review (`/hive/pr/:number`), for links from outside the front
 * page (the roadmap's PlanPanel): it opens the review overlay (`?pr=`).
 */
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
