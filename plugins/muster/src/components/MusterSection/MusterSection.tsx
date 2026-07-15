import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { Box, Tab, TabList, Tabs } from '@backstage/ui';

import { MusterProviders } from '../MusterProviders';
import { DashboardPage } from '../DashboardPage';
import { McpServersPage } from '../McpServersPage';
import { WorkflowsRouter } from '../WorkflowsRouter';
import { ToolExplorerPage } from '../ToolExplorerPage';

// The muster views. This used to be four SubPageBlueprint tabs on a standalone
// muster page; muster is now a section embedded under the Agent Platform page's
// "MCP Servers" tab, so these render as a second-level tab row here instead.
// Dashboard is first, so the section index redirects to it.
const VIEWS = [
  { path: 'dashboard', title: 'Dashboard' },
  { path: 'servers', title: 'Servers' },
  { path: 'workflows', title: 'Workflows' },
  { path: 'tools', title: 'Tool explorer' },
] as const;

// The section is mounted at a splat route (`/agent-platform/muster/*`), so the
// base path is the current pathname with the matched remainder removed. Work by
// path *segment* count rather than string length: `pathname` stays
// percent-encoded while `useParams()['*']` is decoded, so length maths would
// break on encoded chars — the `/` separator count is unaffected. (Same
// approach as the app's GSPageLayout.)
function useBasePath(): string {
  const { pathname } = useLocation();
  const params = useParams();
  const splatSegments = (params['*'] ?? '').split('/').filter(Boolean).length;
  const segments = pathname.split('/').filter(Boolean);
  return `/${segments
    .slice(0, Math.max(0, segments.length - splatSegments))
    .join('/')}`;
}

// The "MCP Servers" tab of the Agent Platform page. Renders its own second-level
// tab row (a plain bui Tabs strip — the section title comes from the Agent
// Platform header above, so no PluginHeader here) plus the routed view. The tabs
// are navigation links whose active state follows the route (`matchStrategy`);
// the content is driven by the router below, not by TabPanels. Wrapped once in
// MusterProviders so all views share one muster instance + session, and the
// providers don't remount as the user switches views.
export const MusterSection = () => {
  const basePath = useBasePath();

  return (
    <MusterProviders>
      {/* Inset the tab strip by the page gutter (bui space-5 = 20px) so it lines
          up with the level-1 header tabs and the content below, which the
          PluginHeader / Content apply automatically but this bare Tabs row does
          not. */}
      <Box px="5">
        <Tabs>
          <TabList>
            {VIEWS.map(view => (
              <Tab
                key={view.path}
                id={view.path}
                href={`${basePath}/${view.path}`}
                matchStrategy="prefix"
              >
                {view.title}
              </Tab>
            ))}
          </TabList>
        </Tabs>
      </Box>
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="servers" element={<McpServersPage />} />
        <Route path="workflows/*" element={<WorkflowsRouter />} />
        <Route path="tools" element={<ToolExplorerPage />} />
      </Routes>
    </MusterProviders>
  );
};
