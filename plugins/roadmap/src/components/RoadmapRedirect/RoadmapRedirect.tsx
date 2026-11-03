import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { rootRouteRef } from '../../routes';

/**
 * `/roadmap…` → the board in Hive (`/hive/roadmap…`), path and parameters
 * kept, so an old link to a view or an item still opens it.
 */
export function RoadmapRedirect() {
  const board = useRouteRef(rootRouteRef);
  const splat = useParams()['*'] ?? '';
  const { search, hash } = useLocation();
  const base = board?.();
  if (!base) {
    return null;
  }
  const path = [base, splat].filter(Boolean).join('/');
  return <Navigate to={`${path}${search}${hash}`} replace />;
}
