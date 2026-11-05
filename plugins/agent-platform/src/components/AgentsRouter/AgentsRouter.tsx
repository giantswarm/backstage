import type { ReactNode } from 'react';
import { Navigate, Routes, Route, useParams } from 'react-router-dom';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { NewAgentFormProvider } from '../NewAgentFormProvider';
import { NewAgentStep } from '../NewAgentStep';
import { AgentDetailPage } from '../AgentDetailPage';
import { EditAgentPage } from '../EditAgentPage';
import { NewAgentPage } from '../NewAgentPage';
import { NewAgentSkillsPage } from '../NewAgentSkillsPage';
import { NewAgentToolsPage } from '../NewAgentToolsPage';
import { NewAgentReviewPage } from '../NewAgentReviewPage';
import { ShellCustomizeRedirect } from '../ShellCustomizeRedirect';
import { RouteRefRedirect } from '../RouteRefRedirect';
import { newAgentRouteRef } from '../../routes';

/**
 * `new` is a reserved word here: an address that starts with it is never an
 * agent on an installation named so, however deep it goes (react-router
 * ranks three dynamic segments above `new/*`). Such an address lands on the
 * wizard's first step, its nearest valid parent.
 */
function AgentRoute({ children }: { children: ReactNode }) {
  const { installation } = useParams();
  if (installation?.toLowerCase() === 'new') {
    return <RouteRefRedirect routeRef={newAgentRouteRef} />;
  }
  return <>{children}</>;
}

// Content of the Customize screen's Agents tab below its list: one agent's
// page, its edit, and the create wizard. The create steps share one
// NewAgentFormProvider so the composed agent survives navigation across
// `new`, `new/skills`, `new/tools` and `new/review`, and it keeps that agent
// as a draft in the tab's sessionStorage, so a reload, Back, or a link
// followed in the same tab brings the form back as it was (`persistDraft`).
//
// This router is mounted as the tab's content (a descendant `<Routes>`), so the
// paths here are relative — no leading slash — matching muster's WorkflowsRouter.
// The list at the tab's bare path is the Customize screen's own.
//
// Order does not decide the match: react-router ranks static segments above
// dynamic ones and matches on segment count, so `new`/`new/skills`/`new/tools`/
// `new/review` (one and two segments) can never be swallowed by the detail path.
//
// The detail route is a splat because the detail page is tabbed (Overview,
// Sessions, Tools, Usage) and hosts a descendant `<Routes>` of its own. The
// edit wizard (`…/<name>/edit`) ends in a static segment, which react-router
// scores above the detail page's splat. AgentsRouter.test.tsx holds both
// rankings.
//
// Anything else — an installation or a namespace alone, an unknown create
// step — lands on the nearest valid parent: the wizard's first step, or the
// list.
export const AgentsRouter = () => {
  // The form and review steps, and an agent's page, open at their top.
  useScrollToTopOnNavigation();
  return (
    <QueryClientProvider>
      <NewAgentFormProvider persistDraft>
        <Routes>
          <Route
            path="new"
            element={
              <NewAgentStep details>
                <NewAgentPage />
              </NewAgentStep>
            }
          />
          <Route
            path="new/skills"
            element={
              <NewAgentStep>
                <NewAgentSkillsPage />
              </NewAgentStep>
            }
          />
          <Route
            path="new/tools"
            element={
              <NewAgentStep>
                <NewAgentToolsPage />
              </NewAgentStep>
            }
          />
          <Route
            path="new/review"
            element={
              <NewAgentStep>
                <NewAgentReviewPage />
              </NewAgentStep>
            }
          />
          <Route path="new/*" element={<Navigate to="." replace />} />
          <Route
            path=":installation/:namespace/:name/*"
            element={
              <AgentRoute>
                <AgentDetailPage />
              </AgentRoute>
            }
          />
          {/* Editing is the create wizard, prefilled; it nests its own steps
              and its own form state (see EditAgentPage). */}
          <Route
            path=":installation/:namespace/:name/edit/*"
            element={
              <AgentRoute>
                <EditAgentPage />
              </AgentRoute>
            }
          />
          <Route path="*" element={<ShellCustomizeRedirect tab="agents" />} />
        </Routes>
      </NewAgentFormProvider>
    </QueryClientProvider>
  );
};
