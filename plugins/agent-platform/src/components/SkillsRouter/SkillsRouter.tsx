import { Route, Routes } from 'react-router-dom';
import { AgentPlatformCookieAuth } from '../AgentPlatformCookieAuth';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { QueryClientProvider } from '../QueryClientProvider';
import { AddSkillPage } from '../AddSkillPage';
import { EditSkillPage } from '../EditSkillPage';
import { SkillDetailPage } from '../SkillDetailPage';

/**
 * The skill pages under the Customize screen's Skills tab
 * (`/customize/skills`, whose bare path is the list): `new` is the add-skill
 * form, `/edit/<owner>/<repo>[/<skill dir>]` the same form editing
 * an existing skill, and everything else is one skill's detail page,
 * addressed as `<owner>/<repo>[/<skill dir>]` — a splat, because a skill
 * directory may be nested. (Skills in a repository owned by an account named
 * literally `edit` would have their pages shadowed by the edit route — an
 * accepted corner, the price of readable URLs.)
 *
 * The provider stack mirrors `ConnectorUsedBy`'s: the detail page lists the
 * agents using the skill (`useAgents` under `AgentsDataProvider`, which reads
 * models through `ModelConfigsProvider`) and renders their avatars through the
 * cookie-authenticated backend. The header-actions slot is the Customize
 * page's, as for every tab under it.
 */
export function SkillsRouter() {
  return (
    <QueryClientProvider>
      <AgentPlatformCookieAuth>
        <ModelConfigsProvider>
          <AgentsDataProvider>
            <Routes>
              {/* Static `new` outranks the detail splat, so the add form
                    can never be swallowed by a skill's page. */}
              <Route path="new" element={<AddSkillPage />} />
              <Route path="edit/*" element={<EditSkillPage />} />
              <Route path="*" element={<SkillDetailPage />} />
            </Routes>
          </AgentsDataProvider>
        </ModelConfigsProvider>
      </AgentPlatformCookieAuth>
    </QueryClientProvider>
  );
}
