import { Routes, Route } from 'react-router-dom';
import { workflowDetailRouteRef } from '../routes';
import { QueryClientProvider } from './QueryClientProvider';
import { MusterPage } from './MusterPage';
import { WorkflowDetailPage } from './WorkflowDetailPage';

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
        <Route path="/*" element={<MusterPage />} />
      </Routes>
    </QueryClientProvider>
  );
};
