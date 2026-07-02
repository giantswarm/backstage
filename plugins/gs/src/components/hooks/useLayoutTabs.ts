import { ReactNode } from 'react';
import { useLocation, useParams, useRoutes } from 'react-router-dom';
import type { HeaderTab } from '@backstage/ui';

export type LayoutTabRoute = {
  path: string;
  title: string;
  children: JSX.Element;
};

/**
 * Turns a layout's sub-routes into bui `PluginHeader` tabs plus the routed
 * content element for the currently active sub-route.
 *
 * The tabs are rendered inside the bui `PluginHeader` (via its `tabs` prop),
 * matching the muster and flux sections. Each tab links to the absolute path of
 * its sub-route; `matchStrategy` keeps the tab active for nested paths. This
 * replaces the classic `RoutedTabs` from `@backstage/core-components`.
 */
export function useLayoutTabs(routes: LayoutTabRoute[]): {
  tabs: HeaderTab[];
  element: ReactNode;
} {
  const { pathname } = useLocation();
  const params = useParams();

  // Render the element for the active sub-route. Mirrors the route matching in
  // the classic RoutedTabs: longest path first, falling back to the first tab.
  const routeObjects = routes.map(({ path, children }) => ({
    caseSensitive: false,
    path: `${path}/*`,
    element: children,
  }));
  const sortedRouteObjects = [...routeObjects].sort((a, b) =>
    b.path.replace(/\/\*$/, '').localeCompare(a.path.replace(/\/\*$/, '')),
  );
  const element = useRoutes(sortedRouteObjects) ?? routes[0]?.children;

  // The layout is mounted at a splat route (e.g. `/clusters/:.../*`), so the
  // base path is the current pathname with the matched remainder removed.
  const splat = params['*'] ?? '';
  let basePath =
    splat && pathname.endsWith(splat)
      ? pathname.slice(0, pathname.length - splat.length)
      : pathname;
  basePath = basePath.replace(/\/+$/, '');

  const tabs: HeaderTab[] = routes.map(({ path, title }) => {
    const cleanPath = path.replace(/^\//, '').replace(/\/\*$/, '');
    return {
      id: path || 'index',
      label: title,
      href: cleanPath ? `${basePath}/${cleanPath}` : basePath,
      // The index tab must match exactly, otherwise it stays active on every
      // sub-route (its href is a prefix of them all).
      matchStrategy: cleanPath ? 'prefix' : 'exact',
    };
  });

  return { tabs, element };
}
