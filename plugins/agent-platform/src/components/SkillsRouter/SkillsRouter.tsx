import { Navigate, Route, Routes } from 'react-router-dom';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import { AgentPlatformCookieAuth } from '../AgentPlatformCookieAuth';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { QueryClientProvider } from '../QueryClientProvider';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import { SkillDetailPage } from '../SkillDetailPage';

/**
 * The skill pages under `/agent-platform/skills`: the bare path goes to the
 * shell's Customize → Skills tab (the list lives there), everything deeper is
 * one skill's detail page, addressed as `<owner>/<repo>[/<skill dir>]` — a
 * splat, because a skill directory may be nested.
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
                    <Navigate to={`${SHELL_CUSTOMIZE_PATH}/skills`} replace />
                  }
                />
                <Route path="*" element={<SkillDetailPage />} />
              </Routes>
            </PageHeaderActionsProvider>
          </AgentsDataProvider>
        </ModelConfigsProvider>
      </AgentPlatformCookieAuth>
    </QueryClientProvider>
  );
}
