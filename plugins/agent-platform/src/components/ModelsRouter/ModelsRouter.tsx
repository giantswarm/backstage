import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { Box, Flex, Tab, TabList, Tabs } from '@backstage/ui';
import {
  ShellPage,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import {
  hasServingLayer,
  ServingProvider,
  useServing,
} from '../ServingProvider';
import { ServedModelRowsProvider } from '../ServedModelRowsProvider';
import { ModelConfigsPage } from '../ModelConfigsPage';
import { NewModelPage } from '../NewModelPage';
import { EditModelPage } from '../EditModelPage';
import { ModelDetailPage } from '../ModelDetailPage';
import { ServingPage } from '../ServingPage';
import { GpuCapacityPage } from '../GpuCapacityPage';
import { ModelCachePage } from '../ModelCachePage';
import { ModelHostingKpis } from '../ModelHostingKpis';
import {
  SHELL_CUSTOMIZE_PATH,
  ShellCustomizeRedirect,
} from '../ShellCustomizeRedirect';
import { useAgentShell } from '../../hooks/useAgentShell';
import { useClusterManagerAvailability } from '../../hooks/useClusterManager';

// The serving layer's two views, as a second-level tab row under the Agent
// Platform page's "Models" tab. The ModelConfigs list is not among them: it is
// the tab's own page, at `/agent-platform/models`.
const SERVING_VIEWS = [
  { path: 'serving', title: 'Serving' },
  { path: 'capacity', title: 'GPU capacity' },
] as const;

/**
 * The ModelConfigs list, its create flow and one model used to live under a
 * `configs` view of their own (`/models/configs`, `.../configs/new`,
 * `.../configs/<installation>/<namespace>/<name>`). Redirect those so a
 * bookmarked model or a link from an older release still resolves.
 *
 * `..` climbs one *route* -- however many segments -- back to the tab root.
 */
const LegacyConfigsRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '..', search }} replace />;
};

const LegacyNewRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '../new', search }} replace />;
};

const LegacyDetailRedirect = () => {
  const { installation = '', namespace = '', name = '' } = useParams();
  const { search } = useLocation();
  return (
    <Navigate
      to={{
        pathname: `../${[installation, namespace, name]
          .map(encodeURIComponent)
          .join('/')}`,
        search,
      }}
      replace
    />
  );
};

/**
 * Model hosting's tabs inside the shell, named per the prototype where the
 * view holds what the name says:
 *
 * - **Running models** — the Serving view: the served models, grouped by the
 *   backend that serves them. The backends are those groups' headers (with
 *   Add and Remove), so the prototype's separate Backends tab is folded in
 *   here rather than repeated as a list of the same data.
 * - **GPU pools** — the GPU capacity view: cluster-manager's pools and the
 *   node inventory. Without cluster-manager it lists nodes only, so it keeps
 *   its old name, "GPU capacity".
 * - **Model cache** — the cache volumes cluster-manager lists, offered where
 *   an installation runs cluster-manager (or while that is being asked).
 */
function shellHostingTabs(clusterManager: boolean) {
  return [
    { id: 'serving', path: 'serving', title: 'Running models' },
    {
      id: 'capacity',
      path: 'capacity',
      title: clusterManager ? 'GPU pools' : 'GPU capacity',
    },
    ...(clusterManager
      ? [{ id: 'cache', path: 'cache', title: 'Model cache' }]
      : []),
  ];
}

/**
 * Model hosting inside the agent-platform shell: the serving layer's views
 * under the platform-standard page frame (`ShellPage`) — breadcrumbs
 * "Customize / Models / Model hosting", the screen's title at the standard
 * scale, the views as its routed tabs and, above every view, the headline
 * figures (`ModelHostingKpis`). The actions a view registers (Serve model,
 * Add GPU pool…) land in this header's slot, and the shell's generic sub-page
 * header stands aside because `ShellPage` claims it.
 *
 * The tabs and figures show where a serving layer exists; a deep link on a
 * portal without one keeps the frame and lets the view's own empty state
 * speak.
 */
const ShellModelHosting = () => {
  const basePath = useSplatBasePath();
  const { search } = useLocation();
  const serving = useServing();
  const servingLayer = hasServingLayer(serving);
  const clusterManager = useClusterManagerAvailability(
    serving.reachableInstallations ?? [],
  );
  const offersCache =
    clusterManager.available.length > 0 || clusterManager.isLoading;

  return (
    <ShellPage
      title="Model hosting"
      breadcrumbs={[
        { label: 'Customize', href: SHELL_CUSTOMIZE_PATH },
        { label: 'Models', href: `${SHELL_CUSTOMIZE_PATH}/models` },
        { label: 'Model hosting' },
      ]}
      description="Run models on your own GPUs, so data stays in your clusters."
      tabs={servingLayer ? shellHostingTabs(offersCache) : undefined}
    >
      <Flex direction="column" gap="5">
        {servingLayer && <ModelHostingKpis />}
        <Routes>
          <Route path="serving" element={<ServingPage />} />
          <Route
            path="capacity"
            element={<GpuCapacityPage showModelCache={false} />}
          />
          <Route path="cache" element={<ModelCachePage />} />
          {/* A guess or a retired view lands on the first view rather than
              on the frame over an empty page. Absolute, from the splat base
              path: a relative target inside a splat route would append. */}
          <Route
            path="*"
            element={
              <Navigate
                to={{ pathname: `${basePath}/serving`, search }}
                replace
              />
            }
          />
        </Routes>
      </Flex>
    </ShellPage>
  );
};

/**
 * The tab's views inside the agent-platform shell. The list is the Customize
 * screen's Models tab, so the index sends there; the create and edit flows and
 * one model's page frame themselves; everything else is model hosting.
 */
const ShellModelsViews = () => (
  <Routes>
    <Route index element={<ShellCustomizeRedirect tab="models" />} />
    <Route path="new" element={<NewModelPage />} />
    <Route
      path="edit/:installation/:namespace/:name"
      element={<EditModelPage />}
    />
    <Route
      path=":installation/:namespace/:name"
      element={<ModelDetailPage />}
    />
    <Route path="*" element={<ShellModelHosting />} />
  </Routes>
);

// The routed view, and the tab strip above it — in classic chrome, under the
// Agent Platform page's header. Inside the shell the frame is
// `ShellModelsViews` instead.
//
// The two serving views only exist once a reachable installation has a serving
// layer this portal can see (or could not be asked). A model-manager that
// answers counts, backends or not: it ships with none, and the Serving view is
// where one is registered. Their routes stay mounted regardless, so a deep
// link renders the view's own empty state.
//
// The strip is dropped in exactly one case: the list, on a portal with no
// serving layer. That is the only place a lone "Model configs" tab would lead
// back to the page it is already on. It is kept everywhere else, including a
// deep-linked Serving page on such a portal -- that tab is then the only way
// back to the list, and hiding it would strand the reader on a page whose own
// empty state tells them nothing is served here.
const ModelsViews = () => {
  const basePath = useSplatBasePath();
  const { pathname } = useLocation();
  const servingLayer = hasServingLayer(useServing());
  const onList = pathname.replace(/\/$/, '') === basePath;
  const agentShell = useAgentShell();
  if (agentShell) {
    return <ShellModelsViews />;
  }
  const showTabs = servingLayer || !onList;

  return (
    <>
      {/* Inset the tab strip by the page gutter so it lines up with the level-1
          header tabs and the content below. `px="5"` is hand-matched to the
          horizontal padding the bui PluginHeader / Content apply (bui space-5 =
          20px), the same value UsageRouter uses; if bui ever changes that
          gutter both have to follow. */}
      {showTabs && (
        <Box px="5">
          <Tabs>
            <TabList>
              {/* `prefix`, though this tab's href is the root every other
                  view hangs off: bui picks the active tab by the *most* path
                  segments matched, so Serving still wins on its own path. What
                  prefix buys is the create and detail pages, which are the
                  list's own sub-routes and keep it highlighted. */}
              <Tab id="configs" href={basePath} matchStrategy="prefix">
                Model configs
              </Tab>
              {servingLayer &&
                SERVING_VIEWS.map(view => (
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
      )}
      <Routes>
        <Route index element={<ModelConfigsPage />} />
        <Route path="new" element={<NewModelPage />} />
        {/* `new` (one segment) and the four-segment edit path can never be
            swallowed by the three-segment detail path: react-router matches
            on segment count. */}
        <Route
          path="edit/:installation/:namespace/:name"
          element={<EditModelPage />}
        />
        <Route
          path=":installation/:namespace/:name"
          element={<ModelDetailPage />}
        />
        <Route path="serving" element={<ServingPage />} />
        <Route path="capacity" element={<GpuCapacityPage />} />
      </Routes>
    </>
  );
};

/**
 * Content of the "Models" tab. Mounted as the tab's content (a descendant
 * `<Routes>`), so the paths here are relative — no leading slash — matching
 * AgentsRouter.
 *
 * The providers wrap every view once, so switching views neither remounts them
 * nor refetches: the Model configs list needs the serving snapshot for its
 * "Served by" column as much as the Serving view does, and the served-model
 * rows (with the auto-wiring that completes a serve) keep running whichever
 * view is open — a model served from the Serving view still gets its
 * ModelConfig while the user waits for it on the Model configs view.
 *
 * The legacy redirects are siblings of the views, not routes inside them, so the
 * tab strip never renders for a location that is about to change. They can sit
 * inside the providers: no provider here writes to the URL, so nothing races
 * the redirect.
 */
export const ModelsRouter = () => {
  return (
    <QueryClientProvider>
      <ModelConfigsProvider>
        <ServingProvider>
          <ServedModelRowsProvider>
            <Routes>
              <Route path="configs" element={<LegacyConfigsRedirect />} />
              <Route path="configs/new" element={<LegacyNewRedirect />} />
              <Route
                path="configs/:installation/:namespace/:name"
                element={<LegacyDetailRedirect />}
              />
              <Route path="*" element={<ModelsViews />} />
            </Routes>
          </ServedModelRowsProvider>
        </ServingProvider>
      </ModelConfigsProvider>
    </QueryClientProvider>
  );
};
