import { Routes, Route } from 'react-router-dom';
import { workflowDetailRouteRef } from '../routes';
import { QueryClientProvider } from './QueryClientProvider';
import { WorkflowsListPage } from './WorkflowsListPage';
import { WorkflowDetailPage } from './WorkflowDetailPage';

export const Router = () => {
  return (
    <QueryClientProvider>
      <Routes>
        <Route path="/" element={<WorkflowsListPage />} />
        <Route
          path={workflowDetailRouteRef.path}
          element={<WorkflowDetailPage />}
        />
      </Routes>
    </QueryClientProvider>
  );
};
