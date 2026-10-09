import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Box, Flex, Tab, TabList, Tabs } from '@backstage/ui';
import { useSplatBasePath } from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { UsageOverviewPage } from '../UsageOverviewPage';
import { UsageCostPage } from '../UsageCostPage';
import { UsageConversationsPage } from '../UsageConversationsPage';
import { UsageTechnicalPage } from '../UsageTechnicalPage';
import { UsageScopeBar } from './UsageScopeBar';

// The Usage screen's views, per the prototype: Overview · Cost · Your
// sessions · Technical details. The first three are for anyone who spends;
// the last is the raw-numbers view for admins and platform engineers, and it
// is also where the muster plugin's tool-call section lands.
const VIEWS = [
  { path: 'overview', title: 'Overview' },
  { path: 'cost', title: 'Cost' },
  { path: 'conversations', title: 'Your sessions' },
  { path: 'technical', title: 'Technical details' },
] as const;

/**
 * The views the screen-level time-range control scopes: the gateway-derived
 * ones. Your sessions reads the kagent fan-out's own fixed window, which the
 * section names itself, so the control hides there rather than claiming a
 * scope it does not apply.
 */
const WINDOWED_VIEWS = new Set(['overview', 'cost', 'technical']);

/** Sends the tab index to the first view, keeping the query string. */
const IndexRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: 'overview', search }} replace />;
};

/**
 * The old single-page Usage tab lived at `/agent-platform/usage` with no
 * sub-routes, so nothing needs redirecting — the index handles the one URL
 * that ever existed; `/usage/mcp` (the Connectors tab this screen's Technical
 * details view absorbed) redirects below, and the catch-all handles a guess
 * or a typo.
 *
 * The tab strip plus the routed view. The tabs are navigation links whose
 * active state follows the route (`matchStrategy`); the content is driven by
 * the router below, not by TabPanels. Above the strip sit the scope controls:
 * the Environment selector (only when more than one installation is
 * configured) and the time window, both URL state so they survive the tab
 * switch — which is also why each tab's href carries the current search.
 */
const UsageViews = ({ sections }: { sections?: ReactNode[] }) => {
  const basePath = useSplatBasePath();
  const { pathname, search } = useLocation();
  const activeSegment = pathname.slice(basePath.length).split('/')[1];

  return (
    <>
      {/* Inset the controls and the tab strip by the page gutter so they line
          up with the level-1 header tabs and the content below. `px="5"` is
          hand-matched to the horizontal padding the bui PluginHeader / Content
          apply (bui space-5 = 20px), the same value ModelsRouter uses; if bui
          ever changes that gutter both have to follow. */}
      <Box px="5">
        <Flex
          justify="between"
          align="end"
          gap="3"
          style={{ flexWrap: 'wrap' }}
        >
          <Tabs>
            <TabList>
              {VIEWS.map(view => (
                <Tab
                  key={view.path}
                  id={view.path}
                  // Absolute, from the splat base path. A *relative* bui href
                  // inside a splat route resolves against the whole current
                  // pathname, so it appends the active segment instead of
                  // replacing it. The search keeps the scope (installation,
                  // window) across the switch.
                  href={`${basePath}/${view.path}${search}`}
                  matchStrategy="prefix"
                >
                  {view.title}
                </Tab>
              ))}
            </TabList>
          </Tabs>
          <UsageScopeBar windowApplies={WINDOWED_VIEWS.has(activeSegment)} />
        </Flex>
      </Box>
      <Routes>
        <Route path="overview" element={<UsageOverviewPage />} />
        <Route path="cost" element={<UsageCostPage />} />
        <Route path="conversations" element={<UsageConversationsPage />} />
        <Route
          path="technical"
          element={<UsageTechnicalPage sections={sections} />}
        />
        {/* The Connectors tab's old address: its content lives inside
            Technical details now, so a bookmark lands there rather than on a
            404 or on Overview. */}
        <Route
          path="mcp"
          element={
            <Navigate
              to={{ pathname: `${basePath}/technical`, search }}
              replace
            />
          }
        />
        {/* Anything else lands on Overview rather than on the tab strip over
            an empty page with no tab active — which is what
            `/agent-platform/usage/sessions` did, a likely guess given the tab
            reads "Your sessions" while the path is `conversations`. Absolute,
            from the splat base path, for the reason the tab hrefs are: a
            relative target inside a splat route resolves against the whole
            current pathname and would append rather than replace. */}
        <Route
          path="*"
          element={
            <Navigate
              to={{ pathname: `${basePath}/overview`, search }}
              replace
            />
          }
        />
      </Routes>
    </>
  );
};

/**
 * The Usage screen's content: providers, then the tabbed views.
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
 * nor refetches — which matters more here than on the Models tab: the
 * gateway views run the same twelve Mimir queries, and they only cost one round
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
