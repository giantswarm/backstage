import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { plansRootExternalRouteRef, rootRouteRef } from '../../routes';

/**
 * Where an old `/roadmap…` address lives in Hive: an item opens in place on
 * Hive's front page (`/hive?item=:id`), anything else is the board with its
 * view and filters (`/hive/board?…`).
 */
export function roadmapTarget(props: {
  splat: string;
  search: string;
  board: string;
  hive?: string;
}): string {
  const { splat, search, board, hive } = props;
  const item = splat.match(/^items\/([^/]+)/);
  if (item && hive) {
    const params = new URLSearchParams({ item: decodeURIComponent(item[1]) });
    return `${hive}?${params.toString()}`;
  }
  return `${[board, splat].filter(Boolean).join('/')}${search}`;
}

/** `/roadmap…` → its place in Hive, so an old link still opens it. */
export function RoadmapRedirect() {
  const board = useRouteRef(rootRouteRef);
  const hive = useRouteRef(plansRootExternalRouteRef);
  const splat = useParams()['*'] ?? '';
  const { search, hash } = useLocation();
  const base = board?.();
  if (!base) {
    return null;
  }
  const to = roadmapTarget({ splat, search, board: base, hive: hive?.() });
  return <Navigate to={`${to}${hash}`} replace />;
}
