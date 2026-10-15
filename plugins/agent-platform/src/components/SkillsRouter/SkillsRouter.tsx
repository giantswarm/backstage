import { Route, Routes } from 'react-router-dom';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import { AgentPlatformCookieAuth } from '../AgentPlatformCookieAuth';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { QueryClientProvider } from '../QueryClientProvider';
import { ShellCustomizeRedirect } from '../ShellCustomizeRedirect';
import { AddSkillPage } from '../AddSkillPage';
import { EditSkillPage } from '../EditSkillPage';
import { SkillDetailPage } from '../SkillDetailPage';

/**
 * The skill pages under `/agent-platform/skills`: the bare path goes to the
 * shell's Customize → Skills tab (the list lives there), `/new` is the
 * add-skill form, `/edit/<owner>/<repo>[/<skill dir>]` the same form editing
 * an existing skill, and everything else is one skill's detail page,
 * addressed as `<owner>/<repo>[/<skill dir>]` — a splat, because a skill
 * directory may be nested. (Skills in a repository owned by an account named
 * literally `edit` would have their pages shadowed by the edit route — an
 * accepted corner, the price of readable URLs.)
 *
 * The provider stack mirrors `ConnectorUsedBy`'s: the detail page lists the
 * agents using the skill (`useAgents` under `AgentsDataProvider`, which reads
 * models through `ModelConfigsProvider`) and renders their avatars through the
 * cookie-authenticated backend. Its own `PageHeaderActionsProvider`, since the
 * page renders without the app's page layout (`noHeader`).
 */
export function SkillsRouter() {
  return (
    <QueryClientProvider>
      <AgentPlatformCookieAuth>
        <ModelConfigsProvider>
          <AgentsDataProvider>
            <PageHeaderActionsProvider>
              <Routes>
                <Route
                  index
                  element={
                    <ShellCustomizeRedirect tab="skills" keepSearch={false} />
                  }
                />
                {/* Static `new` outranks the detail splat, so the add form
                    can never be swallowed by a skill's page. */}
                <Route path="new" element={<AddSkillPage />} />
                <Route path="edit/*" element={<EditSkillPage />} />
                <Route path="*" element={<SkillDetailPage />} />
              </Routes>
            </PageHeaderActionsProvider>
          </AgentsDataProvider>
        </ModelConfigsProvider>
      </AgentPlatformCookieAuth>
    </QueryClientProvider>
  );
}
