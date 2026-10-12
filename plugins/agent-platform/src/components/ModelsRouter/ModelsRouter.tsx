import type { ReactNode } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { Flex } from '@backstage/ui';
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
import { NewModelPage } from '../NewModelPage';
import { EditModelPage } from '../EditModelPage';
import { ModelDetailPage } from '../ModelDetailPage';
import { ServingPage } from '../ServingPage';
import { GpuCapacityPage } from '../GpuCapacityPage';
import { ModelCachePage } from '../ModelCachePage';
import {
  AddGpuNodePoolRoute,
  AddModelBackendRoute,
  ImportModelRoute,
  PullModelRoute,
  ServeModelRoute,
} from '../HostingFlowRoutes';
import {
  ModelHostingKpis,
  type ModelHostingKpisScope,
} from '../ModelHostingKpis';
import {
  SHELL_CUSTOMIZE_PATH,
  ShellCustomizeRedirect,
} from '../ShellCustomizeRedirect';
import { useClusterManagerAvailability } from '../../hooks/useClusterManager';

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
 * One Model hosting tab: its headline figures — only those about what the
 * tab lists (`ModelHostingKpis`'s scope), so the row does not repeat on every
 * tab — above the view.
 */
const HostingView = ({
  kpis,
  children,
}: {
  kpis: ModelHostingKpisScope | undefined;
  children: ReactNode;
}) => (
  <Flex direction="column" gap="5">
    {kpis && <ModelHostingKpis scope={kpis} />}
    {children}
  </Flex>
);

/**
 * Model hosting: the serving layer's views under the platform-standard page
 * frame (`ShellPage`) — breadcrumbs "Customize / Models / Model hosting", the
 * screen's title at the standard
 * scale, the views as its routed tabs and, above each view, the headline
 * figures about what it lists (`ModelHostingKpis`: the whole row on Running
 * models, the GPU tiles on GPU pools, the cache tile on Model cache). The
 * actions a view registers (`ModelHostingActions`: Serve model, Add GPU node
 * pool…) land in this header's slot, top right.
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
      <Routes>
        <Route
          path="serving"
          element={
            <HostingView kpis={servingLayer ? 'all' : undefined}>
              <ServingPage />
            </HostingView>
          }
        />
        <Route
          path="capacity"
          element={
            <HostingView kpis={servingLayer ? 'gpu' : undefined}>
              <GpuCapacityPage />
            </HostingView>
          }
        />
        <Route
          path="cache"
          element={
            <HostingView kpis={servingLayer ? 'cache' : undefined}>
              <ModelCachePage />
            </HostingView>
          }
        />
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
    </ShellPage>
  );
};

/**
 * Model hosting's create flows, each a page of its own (`WizardFrame`) under
 * the view it adds to: Serve model, Import from Hugging Face, Pull model and
 * Add model backend under Running models (`serving`), Add GPU node pool
 * under GPU pools (`capacity`). Two segments, so the three-segment detail
 * route never takes one; listed before the views, which they frame
 * themselves instead of sitting under the hosting page's header and tabs.
 */
const hostingFlowRoutes = [
  <Route key="serve" path="serving/serve" element={<ServeModelRoute />} />,
  <Route key="import" path="serving/import" element={<ImportModelRoute />} />,
  <Route key="pull" path="serving/pull" element={<PullModelRoute />} />,
  <Route
    key="add-backend"
    path="serving/add-backend"
    element={<AddModelBackendRoute />}
  />,
  <Route
    key="add-pool"
    path="capacity/add-pool"
    element={<AddGpuNodePoolRoute />}
  />,
];

/**
 * The tab's views. The list is the Customize screen's Models tab, so the index sends there; the create and edit flows and
 * one model's page frame themselves; everything else is model hosting.
 */
const ModelsViews = () => (
  <Routes>
    <Route index element={<ShellCustomizeRedirect tab="models" />} />
    <Route path="new" element={<NewModelPage />} />
    <Route
      path="edit/:installation/:namespace/:name"
      element={<EditModelPage />}
    />
    {hostingFlowRoutes}
    <Route
      path=":installation/:namespace/:name"
      element={<ModelDetailPage />}
    />
    <Route path="*" element={<ShellModelHosting />} />
  </Routes>
);

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
