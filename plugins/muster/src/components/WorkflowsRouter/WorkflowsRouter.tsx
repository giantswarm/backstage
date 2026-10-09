import { Routes, Route } from 'react-router-dom';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';
import { WorkflowsListPage } from '../WorkflowsListPage';
import { WorkflowDetailPage } from '../WorkflowDetailPage';
import { WorkflowPage } from '../WorkflowPage';
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
 * McpServersRouter/ConnectorPage pattern.
 */
export const WorkflowsRouter = () => {
  // A workflow opened from far down the list opens at its top.
  useScrollToTopOnNavigation();
  const agentShell = useAgentShell();
  return (
    <Routes>
      <Route index element={<WorkflowsListPage />} />
      {agentShell ? (
        <Route path=":name/*" element={<WorkflowPage />} />
      ) : (
        <Route path=":name/*" element={<WorkflowDetailPage />} />
      )}
    </Routes>
  );
};
