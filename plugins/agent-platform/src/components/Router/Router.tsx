import { Routes, Route } from 'react-router-dom';

import { newAgentRouteRef, newAgentReviewRouteRef } from '../../routes';
import { QueryClientProvider } from '../QueryClientProvider';
import { NewAgentFormProvider } from '../NewAgentFormProvider';
import { AgentsIndexPage } from '../AgentsIndexPage';
import { NewAgentPage } from '../NewAgentPage';
import { NewAgentReviewPage } from '../NewAgentReviewPage';

// The form and review screens share one NewAgentFormProvider so the composed
// agent survives navigation between `/agents/new` and `/agents/new/review`.
// Route paths come from the sub-route refs (same pattern as the gs clusters
// Router); no `*` catch-all — under react-router v7 a `<Navigate to=".">` there
// resolves to the current path and renders nothing (blank page).
export const Router = () => {
  return (
    <QueryClientProvider>
      <NewAgentFormProvider>
        <Routes>
          <Route path="/" element={<AgentsIndexPage />} />
          <Route path={newAgentRouteRef.path} element={<NewAgentPage />} />
          <Route
            path={newAgentReviewRouteRef.path}
            element={<NewAgentReviewPage />}
          />
        </Routes>
      </NewAgentFormProvider>
    </QueryClientProvider>
  );
};
