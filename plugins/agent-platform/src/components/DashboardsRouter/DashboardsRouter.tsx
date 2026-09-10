import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Box, Tab, TabList, Tabs } from '@backstage/ui';
import { useSplatBasePath } from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { AgentsDashboardPage } from '../AgentsDashboardPage';

// The dashboards, as a second-level tab row under the Agent Platform page's
// "Dashboards" tab — the same shape as the Models tab and the muster section.
// Agents is first, so the tab index redirects to it.
const AGENTS_VIEW = { path: 'agents', title: 'Agents' } as const;
const MCP_VIEW = { path: 'mcp', title: 'MCP' } as const;

/** Sends the tab index to the first dashboard, keeping the query string. */
const IndexRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: AGENTS_VIEW.path, search }} replace />;
};

/**
 * The Dashboards tab: one dashboard per domain, so a reader always knows whose
 * numbers over what scope they are looking at — the whole reason these are tabs
 * rather than sections stacked on one page, where a heading claiming "your"
 * usage sat directly above numbers that are every caller's.
 *
 * The MCP dashboard is contributed by the muster plugin and arrives as a ready
 * element (`mcpDashboard`), so it is **absent, not empty**, on a portal without
 * muster: no tab, and no route either — a deep link to `/dashboards/mcp` there
 * falls through to the index redirect rather than drawing a tab strip over
 * blank content, the same failure MusterSection's legacy redirect documents.
 *
 * The agent providers wrap only the Agents dashboard. They are what turns a
 * session's `agent_id` into a display name and a link (the join `toSessionRow`
 * does for the sessions list), and nothing on the MCP dashboard needs them — so
 * mounting them per view keeps a reader who only opens MCP from paying for an
 * agent-list read. Those lists are cached, persisted and shared with the Agents
 * and Sessions tabs, so after any visit to the section they cost nothing
 * anyway; on a cold deep link the tables render immediately with decoded ids
 * and the names sharpen when the CRs land.
 */
export const DashboardsRouter = ({
  mcpDashboard,
}: {
  mcpDashboard?: ReactNode;
}) => {
  const basePath = useSplatBasePath();
  const views = mcpDashboard ? [AGENTS_VIEW, MCP_VIEW] : [AGENTS_VIEW];

  return (
    <>
      {/* Inset the tab strip by the page gutter so it lines up with the level-1
          header tabs and the content below. `px="5"` is hand-matched to the
          horizontal padding the bui PluginHeader / Content apply (bui space-5 =
          20px), the same value ModelsRouter and MusterSection use; if bui ever
          changes that gutter all three have to follow. */}
      <Box px="5">
        <Tabs>
          <TabList>
            {views.map(view => (
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
        <Route
          path={AGENTS_VIEW.path}
          element={
            <QueryClientProvider>
              <ModelConfigsProvider>
                <AgentsDataProvider>
                  <AgentsDashboardPage />
                </AgentsDataProvider>
              </ModelConfigsProvider>
            </QueryClientProvider>
          }
        />
        {mcpDashboard && <Route path={MCP_VIEW.path} element={mcpDashboard} />}
        {/* Both the index and anything unmatched (an old deep link, or
            `/dashboards/mcp` with muster switched off) land on the first
            dashboard rather than on a tab strip over nothing. */}
        <Route path="*" element={<IndexRedirect />} />
      </Routes>
    </>
  );
};
