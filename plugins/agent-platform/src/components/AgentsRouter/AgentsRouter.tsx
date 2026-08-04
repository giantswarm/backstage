import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';

import { QueryClientProvider } from '../QueryClientProvider';
import { NewAgentFormProvider } from '../NewAgentFormProvider';
import { AgentDetailPage } from '../AgentDetailPage';
import { AgentsIndexPage } from '../AgentsIndexPage';
import { NewAgentPage } from '../NewAgentPage';
import { NewAgentSkillsPage } from '../NewAgentSkillsPage';
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

// Content of the "Agents" tab: the list, one agent's details, and the create
// flow. The three create steps share one NewAgentFormProvider so the composed
// agent survives navigation across `/agent-platform/agents/new`,
// `.../new/skills` and `.../new/review`.
//
// This router is mounted as the tab's content (a descendant `<Routes>`), so the
// paths here are relative — no leading slash — matching muster's WorkflowsRouter.
//
// The detail route is listed last, but order does not decide the match: react-
// router ranks static segments above dynamic ones and matches on segment count,
// so `new`/`new/skills`/`new/review` (one and two segments) can never be
// swallowed by the three-segment detail path.
export const AgentsRouter = () => {
  return (
    <QueryClientProvider>
      <NewAgentFormProvider>
        <ScrollToTop />
        <Routes>
          <Route index element={<AgentsIndexPage />} />
          <Route path="new" element={<NewAgentPage />} />
          <Route path="new/skills" element={<NewAgentSkillsPage />} />
          <Route path="new/review" element={<NewAgentReviewPage />} />
          <Route
            path=":installation/:namespace/:name"
            element={<AgentDetailPage />}
          />
        </Routes>
      </NewAgentFormProvider>
    </QueryClientProvider>
  );
};
