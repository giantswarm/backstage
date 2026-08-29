import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { Box, Tab, TabList, Tabs } from '@backstage/ui';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useSplatBasePath } from '@giantswarm/backstage-plugin-ui-react';

import { workflowDetailRouteRef } from '../../routes';
import { MusterProviders } from '../MusterProviders';
import { DashboardPage } from '../DashboardPage';
import { McpServersRouter } from '../McpServersRouter';
import { WorkflowsRouter } from '../WorkflowsRouter';
import { ToolExplorerPage } from '../ToolExplorerPage';
import { UsagePage } from '../UsagePage';

// The muster views. This used to be four SubPageBlueprint tabs on a standalone
// muster page; muster is now a section embedded under the Agent Platform page's
// "MCP Servers" tab, so these render as a second-level tab row here instead.
// Dashboard is first, so the section index redirects to it.
const VIEWS = [
  { path: 'dashboard', title: 'Dashboard' },
  { path: 'usage', title: 'MCP usage' },
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
const LegacyRunRedirect = () => {
  const { name = '' } = useParams();
  const { search } = useLocation();
  const detailLink = useRouteRef(workflowDetailRouteRef);
  const to = detailLink ? detailLink({ name }) : '../workflows';
  return <Navigate to={`${to}${search}`} replace />;
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
      <Routes>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="servers/*" element={<McpServersRouter />} />
        <Route path="workflows/*" element={<WorkflowsRouter />} />
        <Route path="tools" element={<ToolExplorerPage />} />
      </Routes>
    </MusterProviders>
  );
};

// The "MCP Servers" tab of the Agent Platform page.
//
// The index redirect is a sibling of the views, NOT a route inside
// MusterViews/MusterProviders, and it has to stay that way: MusterInstanceProvider
// writes the active installation into `?installation=` from an effect, and a
// search-only navigation resolves against the pathname of the render it was
// created in. Mounted alongside the redirect, that write lands on the
// pre-redirect path and silently replaces `/muster/dashboard` back with
// `/muster`, leaving the section with no view and no selected tab. It only shows
// once the installations query is cached (i.e. from the second visit in a
// session), because a pending query makes the effect bail out and lose the race.
// Redirecting before the providers mount keeps the two writes in separate
// commits. Same reason the legacy `workflows/:name/run` redirect lives here.
export const MusterSection = () => (
  <Routes>
    <Route index element={<IndexRedirect />} />
    <Route path="workflows/:name/run" element={<LegacyRunRedirect />} />
    <Route path="*" element={<MusterViews />} />
  </Routes>
);
