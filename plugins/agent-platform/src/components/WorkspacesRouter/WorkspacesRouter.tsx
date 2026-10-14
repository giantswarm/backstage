import { Navigate, Route, Routes } from 'react-router-dom';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import { WorkspaceEditorRoute } from '../WorkspaceEditorPage';

/**
 * The workspace pages under `/agent-platform/workspaces`: the bare path goes
 * to the shell's Customize → Workspaces tab (the list lives there), `/new`
 * creates a workspace and `<installation>/<organization>/<name>/edit` edits
 * one. Its own `PageHeaderActionsProvider`, since the page renders without
 * the app's page layout (`noHeader`).
 */
export function WorkspacesRouter() {
  return (
    <QueryClientProvider>
      <PageHeaderActionsProvider>
        <Routes>
          <Route
            index
            element={
              <Navigate to={`${SHELL_CUSTOMIZE_PATH}/workspaces`} replace />
            }
          />
          <Route path="new" element={<WorkspaceEditorRoute mode="create" />} />
          <Route
            path=":installation/:organization/:name/edit"
            element={<WorkspaceEditorRoute mode="edit" />}
          />
          <Route
            path="*"
            element={
              <Navigate to={`${SHELL_CUSTOMIZE_PATH}/workspaces`} replace />
            }
          />
        </Routes>
      </PageHeaderActionsProvider>
    </QueryClientProvider>
  );
}
