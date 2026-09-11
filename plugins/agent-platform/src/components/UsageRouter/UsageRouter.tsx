import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Box, Tab, TabList, Tabs } from '@backstage/ui';
import { useSplatBasePath } from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { UsageOverviewPage } from '../UsageOverviewPage';
import { UsageCostPage } from '../UsageCostPage';
import { UsageConversationsPage } from '../UsageConversationsPage';
import { UsageMcpPage } from '../UsageMcpPage';

// The Usage views, as a second-level tab row under the Agent Platform page's
// "Usage" tab — the same shape as ModelsRouter and the muster section.
//
// Ordered widest scope first: the two gateway-derived views cover every user,
// then the reader's own sessions, then the MCP section. Overview is first, so
// the tab index redirects to it.
const GATEWAY_VIEWS = [
  { path: 'overview', title: 'Overview' },
  { path: 'cost', title: 'Cost' },
] as const;
const CONVERSATIONS_VIEW = {
  path: 'conversations',
  title: 'Your sessions',
} as const;
const MCP_VIEW = { path: 'mcp', title: 'MCP tools' } as const;

/** Sends the tab index to the first view, keeping the query string. */
const IndexRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: 'overview', search }} replace />;
};

/**
 * The old single-page Usage tab lived at `/agent-platform/usage` with no
 * sub-routes, so nothing needs redirecting — the index handles the one URL
 * that ever existed.
 *
 * The tab strip plus the routed view. The tabs are navigation links whose
 * active state follows the route (`matchStrategy`); the content is driven by
 * the router below, not by TabPanels. The MCP tab appears only when the muster
 * plugin contributed a section, the same rule ModelsRouter uses for its
 * serving views — and its route stays mounted regardless, so a deep link
 * renders the view's own explanation rather than a 404.
 */
const UsageViews = ({ sections }: { sections?: ReactNode[] }) => {
  const basePath = useSplatBasePath();
  const hasMcpSection = (sections?.length ?? 0) > 0;
  const views = [
    ...GATEWAY_VIEWS,
    CONVERSATIONS_VIEW,
    ...(hasMcpSection ? [MCP_VIEW] : []),
  ];

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
                // Absolute, from the splat base path. A *relative* bui href
                // inside a splat route resolves against the whole current
                // pathname, so it appends the active segment instead of
                // replacing it.
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
        <Route path="overview" element={<UsageOverviewPage />} />
        <Route path="cost" element={<UsageCostPage />} />
        <Route path="conversations" element={<UsageConversationsPage />} />
        <Route path="mcp" element={<UsageMcpPage sections={sections} />} />
      </Routes>
    </>
  );
};

/**
 * The Usage tab's content: providers, then the tabbed views.
 *
 * `AgentsDataProvider` (which needs `ModelConfigsProvider` above it) is mounted
 * so both by-agent tables can turn an agent reference into a display name and a
 * link — the gateway's `agent_namespace`/`agent` labels on the Cost tab, and
 * kagent's encoded `agent_id` on Your sessions. Those lists are cached,
 * persisted and shared with the Agents and Sessions tabs, so after any visit to
 * the section they cost nothing; on a cold deep link the tables render
 * immediately with raw labels and the names sharpen when the CRs land.
 *
 * The providers wrap every view once, so switching views neither remounts them
 * nor refetches — which matters more here than on the Models tab: the two
 * gateway views run the same nine Mimir queries, and they only cost one round
 * between them because the query client outlives the tab switch.
 *
 * The index redirect is a sibling of the views, not a route inside them, so the
 * tab strip never renders for a location that is about to change.
 */
export const UsageRouter = ({ sections }: { sections?: ReactNode[] }) => (
  <QueryClientProvider>
    <ModelConfigsProvider>
      <AgentsDataProvider>
        <Routes>
          <Route index element={<IndexRedirect />} />
          <Route path="*" element={<UsageViews sections={sections} />} />
        </Routes>
      </AgentsDataProvider>
    </ModelConfigsProvider>
  </QueryClientProvider>
);
