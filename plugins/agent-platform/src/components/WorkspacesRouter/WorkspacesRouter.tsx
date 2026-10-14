import { Route, Routes } from 'react-router-dom';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { WorkspaceEditorRoute } from '../WorkspaceEditorPage';

/**
 * The workspace pages under `/agent-platform/workspaces`: `/new` creates a
 * workspace and `<installation>/<organization>/<name>/edit` edits one; the
 * list is the shell's Customize → Workspaces tab. Its own `PageHeaderActionsProvider`, since the page renders without
 * the app's page layout (`noHeader`).
 */
export function WorkspacesRouter() {
  return (
    <QueryClientProvider>
      <PageHeaderActionsProvider>
        <Routes>
          <Route path="new" element={<WorkspaceEditorRoute mode="create" />} />
          <Route
            path=":installation/:organization/:name/edit"
            element={<WorkspaceEditorRoute mode="edit" />}
          />
        </Routes>
      </PageHeaderActionsProvider>
    </QueryClientProvider>
  );
}
