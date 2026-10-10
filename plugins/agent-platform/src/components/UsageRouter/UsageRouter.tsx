import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Box, Flex, Tab, TabList, Tabs } from '@backstage/ui';
import {
  ShellPage,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { UsageOverviewPage } from '../UsageOverviewPage';
import { UsageCostPage } from '../UsageCostPage';
import { UsageConversationsPage } from '../UsageConversationsPage';
import { UsageColumn } from '../UsageColumn';
import { useAgentShell } from '../../hooks/useAgentShell';
import { UsageScopeBar } from './UsageScopeBar';

// The Usage screen's views: Overview · Cost · Your sessions. Each answers one
// question and every metric has one home among them (see
// `design-context/implementation/usage-metrics-ia.md`): Overview is the
// platform's health and headline trends (and where the muster plugin's
// tool-call section lands), Cost is the only place with money breakdowns, and
// Your sessions is the reader's own slice. The prototype's fourth view,
// Technical details, was dropped: once each of its figures moved to the tab
// whose question it answers, it held nothing of its own.
//
// The time-range control applies to every view. The gateway views scope
// their queries by it directly; Your sessions narrows the kagent fan-out's
// fixed-window answer client-side and says so when the selection asks for
// more than that window holds (the fan-out's window is a backend caching
// contract this screen must not reach into).
const VIEWS = [
  { path: 'overview', title: 'Overview' },
  { path: 'cost', title: 'Cost' },
  { path: 'conversations', title: 'Your sessions' },
] as const;

/** The screen's one line under its title, in the shell's header. */
const USAGE_DESCRIPTION =
  "What agents cost, how much they're used, and how healthy the platform is.";

/** Sends the tab index to the first view, keeping the query string. */
const IndexRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: 'overview', search }} replace />;
};

/**
 * The old single-page Usage tab lived at `/agent-platform/usage` with no
 * sub-routes, so nothing needs redirecting — the index handles the one URL
 * that ever existed; `/usage/mcp` (the Connectors tab) and `/usage/technical`
 * (the Technical details view), whose content now lives on Overview, redirect
 * below, and the catch-all handles a guess or a typo.
 *
 * The routed views alone, shared by both frames below.
 */
const UsageViewRoutes = ({ sections }: { sections?: ReactNode[] }) => {
  const basePath = useSplatBasePath();
  const { search } = useLocation();

  return (
    <Routes>
      <Route
        path="overview"
        element={<UsageOverviewPage sections={sections} />}
      />
      <Route path="cost" element={<UsageCostPage />} />
      <Route path="conversations" element={<UsageConversationsPage />} />
      {/* Retired addresses whose content lives on Overview now — the
          Connectors tab (`mcp`) and the Technical details view (`technical`)
          — so a bookmark lands on that content, not on a 404. */}
      {['mcp', 'technical'].map(retired => (
        <Route
          key={retired}
          path={retired}
          element={
            <Navigate
              to={{ pathname: `${basePath}/overview`, search }}
              replace
            />
          }
        />
      ))}
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
          <Navigate to={{ pathname: `${basePath}/overview`, search }} replace />
        }
      />
    </Routes>
  );
};

/**
 * Inside the agent-platform shell: the platform-standard page frame
 * (`ShellPage`, the one Sessions and Customize use) — "Usage" as the h1 at the
 * standard scale with its one-line description, the scope controls at the
 * header's right, and the views as the page's routed tabs. The shell's generic
 * sub-page header stands aside because `ShellPage` claims the page header, so
 * the screen has one title and each view adds none of its own.
 */
const ShellUsageViews = ({ sections }: { sections?: ReactNode[] }) => {
  const { search } = useLocation();

  return (
    <ShellPage
      title="Usage"
      description={USAGE_DESCRIPTION}
      actions={<UsageScopeBar />}
      tabs={VIEWS.map(view => ({
        id: view.path,
        path: view.path,
        title: view.title,
      }))}
      // The scope (installation, window) is URL state, so every tab keeps it.
      tabsSearch={search}
    >
      <UsageViewRoutes sections={sections} />
    </ShellPage>
  );
};

/**
 * The tab strip plus the routed view. The tabs are navigation links whose
 * active state follows the route (`matchStrategy`); the content is driven by
 * the router, not by TabPanels. Beside the strip sit the scope controls: the
 * Environment selector (only when more than one installation is configured)
 * and the time window, both URL state so they survive the tab switch — which
 * is also why each tab's href carries the current search.
 *
 * In classic chrome the Agent Platform page's header titles the screen and
 * this draws the second-level strip under it; inside the shell the frame is
 * `ShellUsageViews`.
 */
const UsageViews = ({ sections }: { sections?: ReactNode[] }) => {
  const basePath = useSplatBasePath();
  const { search } = useLocation();
  const agentShell = useAgentShell();

  if (agentShell) {
    return <ShellUsageViews sections={sections} />;
  }

  return (
    <>
      {/* Inset the controls and the tab strip by the page gutter so they line
          up with the level-1 header tabs and the content below. `px="5"` is
          hand-matched to the horizontal padding the bui PluginHeader / Content
          apply (bui space-5 = 20px), the same value ModelsRouter uses; if bui
          ever changes that gutter both have to follow. Inside the gutter the
          strip sits in the same centered column as the content below it, so
          the two stay aligned on wide screens. */}
      <Box px="5">
        <UsageColumn>
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
            <UsageScopeBar />
          </Flex>
        </UsageColumn>
      </Box>
      <UsageViewRoutes sections={sections} />
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
