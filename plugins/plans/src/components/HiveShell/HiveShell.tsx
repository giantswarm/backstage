import { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  BreadcrumbEntry,
  IconElement,
  PageLayout,
  pluginHeaderActionsApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { hiveRouteRef } from '../../routes';

/** One of Hive's routes: a tab in the header's row, or a route only. */
export interface HiveRoute {
  path: string;
  title?: string;
  element: ReactElement;
  tab: boolean;
}

/**
 * Hive's frame: the `PluginHeader` with the tab row and the section's
 * header actions, and the routes under it. `PageBlueprint` draws a tab for
 * every sub-page; Hive also routes the epic pages and the plans, which are
 * reached from the views rather than the row, so it draws the frame itself
 * through the same swappable `PageLayout` (`GSPageLayout`).
 */
export function HiveShell(props: {
  title: string;
  icon: IconElement;
  routes: HiveRoute[];
}) {
  const { title, icon, routes } = props;
  const headerActions = useApi(
    pluginHeaderActionsApiRef,
  ).getPluginHeaderActions('plans');
  const titleLink = useRouteRef(hiveRouteRef)?.();
  const tabs = routes
    .filter(route => route.tab)
    .map(route => ({
      id: route.path,
      label: route.title ?? route.path,
      href: route.path,
    }));
  const landing = tabs[0]?.href;

  return (
    <PageLayout
      title={title}
      icon={icon}
      titleLink={titleLink}
      headerActions={headerActions}
      tabs={tabs}
    >
      <Routes>
        {landing && <Route index element={<Navigate to={landing} replace />} />}
        {routes.map(route => (
          <Route
            key={route.path}
            path={`${route.path}/*`}
            element={
              <BreadcrumbEntry
                entry={{ label: route.title ?? route.path, href: route.path }}
              >
                {route.element}
              </BreadcrumbEntry>
            }
          />
        ))}
      </Routes>
    </PageLayout>
  );
}
