import {
  Navigate,
  Routes,
  Route,
  useLocation,
  useParams,
} from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { workflowDetailRouteRef } from '../routes';
import { QueryClientProvider } from './QueryClientProvider';
import { MusterPage } from './MusterPage';
import { WorkflowDetailPage } from './WorkflowDetailPage';

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

export const Router = () => {
  return (
    <QueryClientProvider>
      <Routes>
        {/* Workflow detail is a full page (no tabs); more specific than the
            catch-all below so it wins route ranking. */}
        <Route
          path={workflowDetailRouteRef.path}
          element={<WorkflowDetailPage />}
        />
        <Route path="/workflows/:name/run" element={<LegacyRunRedirect />} />
        <Route path="/*" element={<MusterPage />} />
      </Routes>
    </QueryClientProvider>
  );
};
