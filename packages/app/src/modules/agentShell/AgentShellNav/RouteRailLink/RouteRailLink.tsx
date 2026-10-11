import {
  RouteRef,
  routeResolutionApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
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
  const routeResolution = useApi(routeResolutionApiRef);
  if (!route) {
    return null;
  }
  const currentOn = (item.currentOn ?? []).flatMap(ref => {
    try {
      const path = routeResolution.resolve(ref)?.();
      return path ? [path] : [];
    } catch {
      return [];
    }
  });
  return (
    <RailLink
      item={item}
      href={route()}
      currentOn={currentOn}
      layout={layout}
    />
  );
}
