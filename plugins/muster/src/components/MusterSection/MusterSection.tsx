import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, Tab, TabList, Tabs } from '@backstage/ui';
import { useSplatBasePath } from '@giantswarm/backstage-plugin-ui-react';

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

// The "MCP Servers" tab of the Agent Platform page. Renders its own second-level
// tab row (a plain bui Tabs strip — the section title comes from the Agent
// Platform header above, so no PluginHeader here) plus the routed view. The tabs
// are navigation links whose active state follows the route (`matchStrategy`);
// the content is driven by the router below, not by TabPanels. Wrapped once in
// MusterProviders so all views share one muster instance + session, and the
// providers don't remount as the user switches views.
export const MusterSection = () => {
  const basePath = useSplatBasePath();

  return (
    <MusterProviders>
      {/* Inset the tab strip by the page gutter so it lines up with the level-1
          header tabs and the content below. NOTE: `px="5"` is hand-matched to
          the horizontal padding the bui PluginHeader / Content apply
          automatically (bui space-5 = 20px). bui does not expose that gutter as
          a referenceable token, so if it ever changes this value must be updated
          in lock-step or the level-2 tabs fall out of alignment. */}
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
