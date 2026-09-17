import {
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

/**
 * Create repository: the declaration form with its dry run. The catalog's
 * *Create…* entry lands here where a deployment binds
 * `catalog.createComponent` to `repositories.create`; no scaffolder template
 * is registered for repositories.
 */
export const createRepositoryRouteRef = createSubRouteRef({
  path: '/create',
  parent: rootRouteRef,
});
