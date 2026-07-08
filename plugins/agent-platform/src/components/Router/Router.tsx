import { Routes, Route, Navigate } from 'react-router-dom';

import { QueryClientProvider } from '../QueryClientProvider';
import { NewAgentFormProvider } from '../NewAgentFormProvider';
import { AgentsIndexPage } from '../AgentsIndexPage';
import { NewAgentPage } from '../NewAgentPage';
import { NewAgentReviewPage } from '../NewAgentReviewPage';

// The form and review screens share one NewAgentFormProvider so the composed
// agent survives navigation between `/agents/new` and `/agents/new/review`.
export const Router = () => {
  return (
    <QueryClientProvider>
      <NewAgentFormProvider>
        <Routes>
          <Route path="/" element={<AgentsIndexPage />} />
          <Route path="new" element={<NewAgentPage />} />
          <Route path="new/review" element={<NewAgentReviewPage />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </NewAgentFormProvider>
    </QueryClientProvider>
  );
};
