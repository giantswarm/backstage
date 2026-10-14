import { Navigate, useLocation, useParams } from 'react-router-dom';
import { RouteRef, useRouteRef } from '@backstage/frontend-plugin-api';

/**
 * `/product?tab=knowledge&doc=…` → `knowledge?doc=…`: the old magazine's tab
 * becomes Hive's routed tab, its other parameters stay. Its history window
 * goes: Hive shows one history.
 */
export function magazineTarget(search: string): string {
  const params = new URLSearchParams(search);
  const tab = params.get('tab') ?? 'now';
  params.delete('tab');
  params.delete('window');
  const rest = params.toString();
  return `${tab}${rest ? `?${rest}` : ''}`;
}

/**
 * An old page's address, sent on to its place in Hive with its path and
 * parameters, so every shared link keeps working: `/plans/pr/12?repo=…` →
 * `/hive/plans/pr/12?repo=…`; with `target`, `/product?tab=…` →
 * `/hive/<tab>?…`.
 */
export function HiveRedirect(props: {
  /** Where the old page moved to. */
  routeRef: RouteRef<undefined>;
  /** The path under `routeRef` from the old search, instead of the splat. */
  target?: (search: string) => string;
}) {
  const link = useRouteRef(props.routeRef);
  const splat = useParams()['*'] ?? '';
  const { search, hash } = useLocation();
  const base = link?.();
  if (!base) {
    return null;
  }
  const to = props.target
    ? `${base}/${props.target(search)}${hash}`
    : `${[base, splat].filter(Boolean).join('/')}${search}${hash}`;
  return <Navigate to={to} replace />;
}
