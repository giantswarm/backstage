import { RouteRef, useRouteRef } from '@backstage/frontend-plugin-api';
import type { AgentShellNavItem } from '../../navItems';
import { RailLink } from '../RailLink';

/** A rail link to a route ref; nothing while the route is not bound. */
export function RouteRailLink({
  item,
  routeRef,
  compact,
}: {
  item: AgentShellNavItem;
  routeRef: RouteRef;
  compact: boolean;
}) {
  const route = useRouteRef(routeRef);
  if (!route) {
    return null;
  }
  return <RailLink item={item} href={route()} compact={compact} />;
}
