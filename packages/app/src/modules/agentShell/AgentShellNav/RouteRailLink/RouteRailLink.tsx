import { RouteRef, useRouteRef } from '@backstage/frontend-plugin-api';
import type { AgentShellNavItem } from '../../navItems';
import { RailLink } from '../RailLink';
import type { RailLayout } from '../railLayout';

/** A rail link to a route ref; nothing while the route is not bound. */
export function RouteRailLink({
  item,
  routeRef,
  layout,
}: {
  item: AgentShellNavItem;
  routeRef: RouteRef;
  layout: RailLayout;
}) {
  const route = useRouteRef(routeRef);
  if (!route) {
    return null;
  }
  return <RailLink item={item} href={route()} layout={layout} />;
}
