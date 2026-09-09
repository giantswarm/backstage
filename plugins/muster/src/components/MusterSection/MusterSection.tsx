import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { Box, Tab, TabList, Tabs } from '@backstage/ui';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { InventoryFailureGate } from '@giantswarm/backstage-plugin-gs';
import { useSplatBasePath } from '@giantswarm/backstage-plugin-ui-react';

import {
  agentPlatformUsageExternalRouteRef,
  workflowDetailRouteRef,
} from '../../routes';
import { MusterProviders } from '../MusterProviders';
import { useMusterInstance } from '../MusterInstanceProvider';
import { DashboardPage } from '../DashboardPage';
import { McpServersRouter } from '../McpServersRouter';
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

/**
 * Sends the section index to the first view. Keeps the query string: an explicit
 * `?installation=` in a deep link to the section root has to survive the
 * redirect, or MusterInstanceProvider mounts on a location without the param and
 * falls back to localStorage / the first installation.
 */
const IndexRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: 'dashboard', search }} replace />;
};

/**
 * The bespoke `/workflows/:name/run` route was removed when Run was unified with
 * the tool explorer; a lingering deep link used to silently resolve to the full
 * workflows list. Redirect it to the workflow detail (preserving the query
 * string, e.g. `?installation=`) so the named workflow is not dropped.
 *
 * The fallback is spelled `../workflows` rather than `..`: this route is matched
 * relative to the section root, so a bare `..` would land on the index (and from
 * there on the Dashboard) instead of the workflows list.
 */
/**
 * `/agent-platform/muster/usage` moved to the Agent Platform's own Usage tab,
 * where it sits beside the personal section. The redirect is **required, not a
 * courtesy**: the old path is linkable, and without it the section's `*` route
 * matches, `MusterViews` renders, and its inner `<Routes>` has no fallback — so
 * the tab strip would draw over blank content.
 *
 * A sibling of the index redirect rather than a route inside `MusterViews`, for
 * the same reason that one is, and it preserves the query string so an
 * `?installation=` in a deep link survives. Falls back to `dashboard` when the
 * external ref is unbound (agent-platform disabled), which is where the section
 * index goes anyway.
 */
const LegacyUsageRedirect = () => {
  const { search } = useLocation();
  const usageLink = useRouteRef(agentPlatformUsageExternalRouteRef);
  // The fallback is spelled `../dashboard`, not `dashboard`: this route is
  // matched at `usage`, so a bare relative path resolves *under* it and lands on
  // `/muster/usage/dashboard`. Same trap `LegacyRunRedirect` documents below.
  return (
    <Navigate
      to={`${usageLink ? usageLink() : '../dashboard'}${search}`}
      replace
    />
  );
};

const LegacyRunRedirect = () => {
  const { name = '' } = useParams();
  const { search } = useLocation();
  const detailLink = useRouteRef(workflowDetailRouteRef);
  const to = detailLink ? detailLink({ name }) : '../workflows';
  return <Navigate to={`${to}${search}`} replace />;
};

/**
 * The routed view -- or, when the section has no installation to show because
 * the one it would show could not be asked whether it runs muster, the gate
 * that says so once for every view: which installation, what the API server
 * answered (a 401 the person's token cannot repair, a 403, another error) and
 * what fixes it. Before this, a rejected token left the section without an
 * installation, without a gate and without an error: the dashboard sat on its
 * progress bar and the other views claimed no installation runs muster.
 */
const MusterViewsBody = () => {
  const {
    activeInstallation,
    isLoadingInstallations,
    inventoryFailure,
    refreshInventory,
  } = useMusterInstance();

  if (!isLoadingInstallations && !activeInstallation && inventoryFailure) {
    return (
      <Content>
        <InventoryFailureGate
          failure={inventoryFailure}
          onRetry={refreshInventory}
          context="The MCP servers, workflows and tools of an installation are read through its Kubernetes API."
        />
      </Content>
    );
  }

  return (
    <Routes>
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="servers/*" element={<McpServersRouter />} />
      <Route path="workflows/*" element={<WorkflowsRouter />} />
      <Route path="tools" element={<ToolExplorerPage />} />
    </Routes>
  );
};

// The second-level tab row (a plain bui Tabs strip — the section title comes from
// the Agent Platform header above, so no PluginHeader here) plus the routed view.
// The tabs are navigation links whose active state follows the route
// (`matchStrategy`); the content is driven by the router below, not by TabPanels.
// Wrapped once in MusterProviders so all views share one muster instance +
// session, and the providers don't remount as the user switches views.
const MusterViews = () => {
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
      <MusterViewsBody />
    </MusterProviders>
  );
};

// The "MCP Servers" tab of the Agent Platform page.
//
// The index redirect is a sibling of the views, NOT a route inside
// MusterViews/MusterProviders. It had to be, while MusterInstanceProvider wrote
// the active installation into `?installation=` from an effect: a search-only
// navigation resolves against the pathname of the render it was created in, so
// mounted alongside the redirect that write landed on the pre-redirect path and
// silently replaced `/muster/dashboard` back with `/muster`. The provider now
// reads the section-wide installation scope (gs `useInstallationScope`) and
// writes nothing on mount; the scope's own URL sync runs in the page header,
// outside these routes. The placement stays: it keeps any future search-only
// write in a separate commit from the redirect. Same reason the legacy
// `workflows/:name/run` redirect lives here.
export const MusterSection = () => (
  <Routes>
    <Route index element={<IndexRedirect />} />
    <Route path="usage" element={<LegacyUsageRedirect />} />
    <Route path="workflows/:name/run" element={<LegacyRunRedirect />} />
    <Route path="*" element={<MusterViews />} />
  </Routes>
);
