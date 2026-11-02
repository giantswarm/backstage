import { Navigate, useLocation } from 'react-router-dom';
import {
  type RouteRef,
  type SubRouteRef,
  useRouteRef,
} from '@backstage/frontend-plugin-api';

/**
 * Sends an address that names no page to the nearest valid parent, the page
 * of `routeRef` (the urls skill, rule 5), replacing the history entry. The
 * query string comes along by default — the installation scope, a search —
 * so the parent opens as the address asked. Nothing where the route is not
 * bound.
 */
export function RouteRefRedirect({
  routeRef,
  keepSearch = true,
}: {
  routeRef: RouteRef<undefined> | SubRouteRef<undefined>;
  keepSearch?: boolean;
}) {
  const { search } = useLocation();
  const link = useRouteRef(routeRef);
  if (!link) {
    return null;
  }
  return (
    <Navigate
      to={{ pathname: link(), search: keepSearch ? search : undefined }}
      replace
    />
  );
}
