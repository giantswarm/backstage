import { Routes, Route } from 'react-router-dom';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';
import { WorkflowsListPage } from '../WorkflowsListPage';
import { WorkflowDetailPage } from '../WorkflowDetailPage';

/**
 * Routing within the Agent Platform's Workflows tab: the list and the
 * per-workflow detail share the tab (the detail keeps the Workflows tab
 * selected). Mounted inside MusterProviders by the workflows sub-page, so both
 * views share one muster instance.
 */
export const WorkflowsRouter = () => {
  // A workflow opened from far down the list opens at its top.
  useScrollToTopOnNavigation();
  return (
    <Routes>
      <Route index element={<WorkflowsListPage />} />
      <Route path=":name/*" element={<WorkflowDetailPage />} />
    </Routes>
  );
};
