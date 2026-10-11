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
import { UsageConnectorsPage } from '../UsageConnectorsPage';
import { UsageColumn } from '../UsageColumn';
import { useAgentShell } from '../../hooks/useAgentShell';
import { UsageScopeBar } from './UsageScopeBar';

// The Usage screen's views: Overview · Cost · Your sessions · Connectors.
// Each answers one question and every metric has one home among them (see
// `design-context/implementation/usage-metrics-ia.md`): Overview is the
// platform's health and headline trends on one screen, Cost is the only place
// with money breakdowns, Connectors is how the connectors and their tools are
// used (the muster plugin's contributed section), and Your sessions is the
// reader's own slice. The prototype's fourth view, Technical details, was
// dropped: once each of its figures moved to the tab whose question it
// answers, it held nothing of its own.
//
// The time-range control applies to every gateway view. The gateway views
// scope their queries by it directly; Your sessions narrows the kagent
// fan-out's fixed-window answer client-side and says so when the selection
// asks for more than that window holds (the fan-out's window is a backend
// caching contract this screen must not reach into). Connectors asks muster
// for the selected span directly.
type UsageView = { path: string; title: string };

const OVERVIEW: UsageView = { path: 'overview', title: 'Overview' };
const COST: UsageView = { path: 'cost', title: 'Cost' };
const CONNECTORS: UsageView = { path: 'connectors', title: 'Connectors' };
const SESSIONS: UsageView = { path: 'conversations', title: 'Your sessions' };

/**
 * The views on offer. Connectors only when a plugin contributed its content —
 * without muster there is nothing to show, and a tab over an empty page reads
 * as broken. The core views first, the optional Connectors last.
 */
function usageViews(hasConnectors: boolean): UsageView[] {
  return hasConnectors
    ? [OVERVIEW, COST, SESSIONS, CONNECTORS]
    : [OVERVIEW, COST, SESSIONS];
}

function hasSectionsIn(sections: ReactNode[] | undefined): boolean {
  return (sections?.length ?? 0) > 0;
}

/** The screen's one line under its title, in the shell's header. */
const USAGE_DESCRIPTION =
  'Shows what agents cost, how much they are used and how healthy the platform is.';

/** Sends the tab index to the first view, keeping the query string. */
const IndexRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: 'overview', search }} replace />;
};

/**
 * The old single-page Usage tab lived at `/agent-platform/usage` with no
 * sub-routes, so nothing needs redirecting — the index handles the one URL
 * that ever existed; `/usage/mcp` (the first Connectors tab's address) now
 * lands on Connectors, `/usage/technical` (the Technical details view) on
 * Overview, and the catch-all handles a guess or a typo.
 *
 * The routed views alone, shared by both frames below.
 */
const UsageViewRoutes = ({ sections }: { sections?: ReactNode[] }) => {
  const basePath = useSplatBasePath();
  const { search } = useLocation();
  const hasConnectors = hasSectionsIn(sections);
  const redirectTo = (view: UsageView) => (
    <Navigate to={{ pathname: `${basePath}/${view.path}`, search }} replace />
  );

  return (
    <Routes>
      <Route path="overview" element={<UsageOverviewPage />} />
      <Route path="cost" element={<UsageCostPage />} />
      <Route
        path="connectors"
        element={
          hasConnectors ? (
            <UsageConnectorsPage sections={sections!} />
          ) : (
            // Nothing contributed the view's content (muster is not
            // registered), so the view is not offered; a bookmark lands on
            // Overview rather than on an empty page under no active tab.
            redirectTo(OVERVIEW)
          )
        }
      />
      <Route path="conversations" element={<UsageConversationsPage />} />
      {/* Retired addresses, so a bookmark lands on their content rather than
          on a 404: `mcp` was the first Connectors tab, `technical` the
          Technical details view whose figures now live on Overview. */}
      <Route
        path="mcp"
        element={redirectTo(hasConnectors ? CONNECTORS : OVERVIEW)}
      />
      <Route path="technical" element={redirectTo(OVERVIEW)} />
      {/* Anything else lands on Overview rather than on the tab strip over
          an empty page with no tab active — which is what
          `/agent-platform/usage/sessions` did, a likely guess given the tab
          reads "Your sessions" while the path is `conversations`. Absolute,
          from the splat base path, for the reason the tab hrefs are: a
          relative target inside a splat route resolves against the whole
          current pathname and would append rather than replace. */}
      <Route path="*" element={redirectTo(OVERVIEW)} />
    </Routes>
  );
};

/**
 * Inside the agent-platform shell: the platform-standard page frame
 * (`ShellPage`, the one Sessions and Customize use) — "Usage" as the h1 at the
 * standard scale with its one-line description, the scope controls at the
 * header's right, and the views as the page's routed tabs. The screen has one
 * title; each view adds none of its own.
 */
const ShellUsageViews = ({ sections }: { sections?: ReactNode[] }) => {
  const { search, pathname } = useLocation();
  const views = usageViews(hasSectionsIn(sections));
  // The open view names the document: "Cost · Usage · Agent Platform".
  const openView = views.find(view =>
    new RegExp(`/${view.path}/?$`).test(pathname),
  );

  return (
    <ShellPage
      title="Usage"
      documentTitle={[openView?.title, 'Usage']}
      description={USAGE_DESCRIPTION}
      actions={<UsageScopeBar />}
      tabs={views.map(view => ({
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
                {usageViews(hasSectionsIn(sections)).map(view => (
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
 * `sections` is the `sections` extension input (the muster plugin's connector
 * tool-call section); it is the Connectors view's content, and that view is
 * offered only when it holds something.
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
