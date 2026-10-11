import type { ReactElement } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';
import { WorkflowsListPage } from '../WorkflowsListPage';
import { WorkflowDetailPage } from '../WorkflowDetailPage';
import { WorkflowPage } from '../WorkflowPage';
import { CustomizeTabRedirect } from '../CustomizeTabRedirect';
import { useAgentShell } from '../../hooks/useAgentShell';

/**
 * Routing within the Agent Platform's Workflows tab: the list and the
 * per-workflow detail share the tab (the detail keeps the Workflows tab
 * selected). Mounted inside MusterProviders by the workflows sub-page, so both
 * views share one muster instance.
 *
 * Inside the agent-platform shell a workflow's route renders the shell's
 * read-only workflow page (per decision D11 no create/edit/delete lives
 * there); the classic detail page is unchanged outside the shell — the
 * McpServersRouter/ConnectorPage pattern. The list, likewise, is the Customize
 * screen's Workflows tab inside the shell: the classic list (with its
 * NamespacePicker and "Create workflow") only renders in the classic chrome.
 *
 * `editAction` is the element another plugin attaches to the sub-page's
 * `editAction` input; the shell's workflow page shows it beside its title.
 */
export const WorkflowsRouter = ({
  editAction,
}: { editAction?: ReactElement } = {}) => {
  // A workflow opened from far down the list opens at its top.
  useScrollToTopOnNavigation();
  const agentShell = useAgentShell();
  return (
    <Routes>
      <Route
        index
        element={
          agentShell ? (
            <CustomizeTabRedirect
              tab="workflows"
              fallback={<WorkflowsListPage />}
            />
          ) : (
            <WorkflowsListPage />
          )
        }
      />
      {agentShell ? (
        <Route
          path=":name/*"
          element={<WorkflowPage editAction={editAction} />}
        />
      ) : (
        <Route path=":name/*" element={<WorkflowDetailPage />} />
      )}
    </Routes>
  );
};
