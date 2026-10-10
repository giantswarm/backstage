import { Routes, Route } from 'react-router-dom';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { NewAgentFormProvider } from '../NewAgentFormProvider';
import { AgentDetailPage } from '../AgentDetailPage';
import { EditAgentPage, LegacyEditAgentRedirect } from '../EditAgentPage';
import { AgentsIndexPage } from '../AgentsIndexPage';
import { NewAgentPage } from '../NewAgentPage';
import { NewAgentSkillsPage } from '../NewAgentSkillsPage';
import { NewAgentToolsPage } from '../NewAgentToolsPage';
import { NewAgentReviewPage } from '../NewAgentReviewPage';
import { ShellCustomizeRedirect } from '../ShellCustomizeRedirect';
import { useAgentShell } from '../../hooks/useAgentShell';

// Content of the "Agents" tab: the list, one agent's details, and the create
// wizard — for a new agent, and prefilled to edit one. The create steps share one NewAgentFormProvider so the composed
// agent survives navigation across `/agent-platform/agents/new`,
// `.../new/skills`, `.../new/tools` and `.../new/review`.
//
// This router is mounted as the tab's content (a descendant `<Routes>`), so the
// paths here are relative — no leading slash — matching muster's WorkflowsRouter.
//
// Order does not decide the match: react-router ranks static segments above
// dynamic ones and matches on segment count, so `new`/`new/skills`/`new/tools`/
// `new/review` (one and two segments) can never be swallowed by the detail path.
//
// The detail route is a splat because the detail page is tabbed (Overview,
// Tools, Skills, Sessions) and hosts a descendant `<Routes>` of its own. The
// edit wizard (`edit/…`) starts with a static segment, which react-router
// scores above the detail path's dynamic one; the former `…/:name/edit`
// address survives beside the splat as a redirect, matched first for the same
// reason. AgentsRouter.test.tsx holds both rankings.
//
// Inside the agent-platform shell the list is the Customize screen's Agents
// tab, so the index sends there.
export const AgentsRouter = () => {
  // The form and review steps, and an agent's page, open at their top.
  useScrollToTopOnNavigation();
  const agentShell = useAgentShell();
  return (
    <QueryClientProvider>
      <NewAgentFormProvider>
        <Routes>
          <Route
            index
            element={
              agentShell ? (
                <ShellCustomizeRedirect tab="agents" />
              ) : (
                <AgentsIndexPage />
              )
            }
          />
          <Route path="new" element={<NewAgentPage />} />
          <Route path="new/skills" element={<NewAgentSkillsPage />} />
          <Route path="new/tools" element={<NewAgentToolsPage />} />
          <Route path="new/review" element={<NewAgentReviewPage />} />
          <Route
            path=":installation/:namespace/:name/*"
            element={<AgentDetailPage />}
          />
          {/* Editing is the create wizard, prefilled; it nests its own steps
              and its own form state (see EditAgentPage). */}
          <Route
            path="edit/:installation/:namespace/:name/*"
            element={<EditAgentPage />}
          />
          <Route
            path=":installation/:namespace/:name/edit"
            element={<LegacyEditAgentRedirect />}
          />
        </Routes>
      </NewAgentFormProvider>
    </QueryClientProvider>
  );
};
