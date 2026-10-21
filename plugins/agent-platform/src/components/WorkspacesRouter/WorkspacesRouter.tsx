import { Route, Routes } from 'react-router-dom';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { workspacesRouteRef } from '../../routes';
import { QueryClientProvider } from '../QueryClientProvider';
import { RouteRefRedirect } from '../RouteRefRedirect';
import { WorkspaceDetailRoute } from '../WorkspaceDetailPage';
import { WorkspaceEditorRoute } from '../WorkspaceEditorPage';

/**
 * The workspace pages under `/customize/workspaces`: `/new` creates a
 * workspace, `<installation>/<organization>/<name>` is one workspace's page
 * (its tabs below it) and `…/<name>/edit` edits it; anything else goes to the list, the shell's
 * Customize → Workspaces tab. Its own `PageHeaderActionsProvider`, since the page renders without
 * the app's page layout (`noHeader`).
 */
export function WorkspacesRouter() {
  return (
    <QueryClientProvider>
      <PageHeaderActionsProvider>
        <Routes>
          <Route path="new" element={<WorkspaceEditorRoute mode="create" />} />
          <Route
            path=":installation/:organization/:name/*"
            element={<WorkspaceDetailRoute />}
          />
          <Route
            path=":installation/:organization/:name/edit"
            element={<WorkspaceEditorRoute mode="edit" />}
          />
          <Route
            path="*"
            element={<RouteRefRedirect routeRef={workspacesRouteRef} />}
          />
        </Routes>
      </PageHeaderActionsProvider>
    </QueryClientProvider>
  );
}
