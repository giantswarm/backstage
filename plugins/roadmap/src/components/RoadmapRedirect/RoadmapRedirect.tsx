import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { epicPageExternalRouteRef, rootRouteRef } from '../../routes';

/**
 * `/roadmap…` → the board in Hive (`/hive/board…`), path and parameters
 * kept; `/roadmap/items/:id` → the item's epic page (`/hive/epics/:id`), so
 * an old link to a view or an item still opens it.
 */
export function RoadmapRedirect() {
  const board = useRouteRef(rootRouteRef);
  const epicPage = useRouteRef(epicPageExternalRouteRef);
  const splat = useParams()['*'] ?? '';
  const { search, hash } = useLocation();
  const item = splat.match(/^items\/([^/]+)/)?.[1];
  if (item && epicPage) {
    return <Navigate to={`${epicPage({ id: item })}${hash}`} replace />;
  }
  const base = board?.();
  if (!base) {
    return null;
  }
  const path = [base, splat].filter(Boolean).join('/');
  return <Navigate to={`${path}${search}${hash}`} replace />;
}
