import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';

import { QueryClientProvider } from '../QueryClientProvider';
import { NewAgentFormProvider } from '../NewAgentFormProvider';
import { AgentsIndexPage } from '../AgentsIndexPage';
import { NewAgentPage } from '../NewAgentPage';
import { NewAgentReviewPage } from '../NewAgentReviewPage';

// react-router keeps the window scroll position across client-side navigation,
// so moving between the form and review would otherwise land mid-page. Reset to
// the top on every in-flow navigation.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Content of the "Agents" tab. The index is a stub landing; the form and review
// screens share one NewAgentFormProvider so the composed agent survives
// navigation between `/agent-platform/agents/new` and `.../new/review`.
//
// This router is mounted as the tab's content (a descendant `<Routes>`), so the
// paths here are relative — no leading slash — matching muster's WorkflowsRouter.
export const AgentsRouter = () => {
  return (
    <QueryClientProvider>
      <NewAgentFormProvider>
        <ScrollToTop />
        <Routes>
          <Route index element={<AgentsIndexPage />} />
          <Route path="new" element={<NewAgentPage />} />
          <Route path="new/review" element={<NewAgentReviewPage />} />
        </Routes>
      </NewAgentFormProvider>
    </QueryClientProvider>
  );
};
