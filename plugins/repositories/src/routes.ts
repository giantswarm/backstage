import {
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

/**
 * Create repository: the declaration form with its dry run, opened from the
 * Repositories page's *Create repository* button. No scaffolder template is
 * registered for repositories.
 */
export const createRepositoryRouteRef = createSubRouteRef({
  path: '/create',
  parent: rootRouteRef,
});
