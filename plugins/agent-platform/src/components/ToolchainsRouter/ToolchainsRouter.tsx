import { Route, Routes } from 'react-router-dom';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { toolchainsRouteRef } from '../../routes';
import { NewToolchainPage } from '../NewToolchainPage';
import { QueryClientProvider } from '../QueryClientProvider';
import { RouteRefRedirect } from '../RouteRefRedirect';
import { ToolchainDetailRoute } from '../ToolchainDetailPage';

/**
 * The toolchain pages under `/customize/toolchains`: `/new` creates a
 * toolchain, `<installation>/<name>` is one toolchain's page; anything else
 * goes to the list, the shell's Customize → Toolchains tab. Its own
 * `PageHeaderActionsProvider`, since the page renders without the app's page
 * layout (`noHeader`).
 */
export function ToolchainsRouter() {
  return (
    <QueryClientProvider>
      <PageHeaderActionsProvider>
        <Routes>
          <Route path="new" element={<NewToolchainPage />} />
          <Route
            path=":installation/:name"
            element={<ToolchainDetailRoute />}
          />
          <Route
            path="*"
            element={<RouteRefRedirect routeRef={toolchainsRouteRef} />}
          />
        </Routes>
      </PageHeaderActionsProvider>
    </QueryClientProvider>
  );
}
