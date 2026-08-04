import { Routes, Route } from 'react-router-dom';
import { WorkflowsListPage } from '../WorkflowsListPage';
import { WorkflowDetailPage } from '../WorkflowDetailPage';

/**
 * Routing within the Workflows tab: the list and the per-workflow detail share
 * the tab (the detail keeps the Workflows tab selected). Mounted inside
 * MusterProviders by the workflows sub-page, so both views share one muster
 * instance.
 *
 * The legacy `workflows/:name/run` deep link is redirected one level up in
 * MusterSection, outside MusterProviders — see the note there.
 */
export const WorkflowsRouter = () => {
  return (
    <Routes>
      <Route index element={<WorkflowsListPage />} />
      <Route path=":name" element={<WorkflowDetailPage />} />
    </Routes>
  );
};
