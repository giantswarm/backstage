import {
  Navigate,
  Routes,
  Route,
  useLocation,
  useParams,
} from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { workflowDetailRouteRef } from '../../routes';
import { WorkflowsListPage } from '../WorkflowsListPage';
import { WorkflowDetailPage } from '../WorkflowDetailPage';

/**
 * The bespoke `/workflows/:name/run` route was removed when Run was unified with
 * the tool explorer; a lingering deep link used to silently resolve to the full
 * workflows list. Redirect it to the workflow detail (preserving the query
 * string, e.g. `?installation=`) so the named workflow is not dropped.
 */
const LegacyRunRedirect = () => {
  const { name = '' } = useParams();
  const { search } = useLocation();
  const detailLink = useRouteRef(workflowDetailRouteRef);
  const to = detailLink ? detailLink({ name }) : '..';
  return <Navigate to={`${to}${search}`} replace />;
};

/**
 * Routing within the Workflows tab: the list and the per-workflow detail share
 * the tab (the detail keeps the Workflows tab selected). Mounted inside
 * MusterProviders by the workflows sub-page, so both views share one muster
 * instance.
 */
export const WorkflowsRouter = () => {
  return (
    <Routes>
      <Route index element={<WorkflowsListPage />} />
      <Route path=":name/run" element={<LegacyRunRedirect />} />
      <Route path=":name" element={<WorkflowDetailPage />} />
    </Routes>
  );
};
