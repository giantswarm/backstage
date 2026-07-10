import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

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
