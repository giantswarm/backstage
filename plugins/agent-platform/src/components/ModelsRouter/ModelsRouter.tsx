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
  ALL_INSTALLATIONS,
  useInstallationScope,
} from '@giantswarm/backstage-plugin-gs';
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
import { ServingPage } from '../ServingPage';
import { GpuCapacityPage } from '../GpuCapacityPage';
import { ModelCachePage } from '../ModelCachePage';
import { EnvironmentSelect } from '../EnvironmentSelect';
import {
  InstallationScopeNote,
  useUnknownScopePin,
} from '../InstallationScopeNote';
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
import { ModelHostingSharedIdentityNote } from '../ModelHostingSharedIdentity';
import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { isLegacyServeLink } from '../../lib/modelManagerServe';
import { nothingCouldBeRead } from '../../lib/soleInstallation';

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

/**
 * One model's page moved beside the Customize screen's Models tab
 * (`/customize/models/<installation>/<namespace>/<name>`), from this tab's
 * `<installation>/<namespace>/<name>` and, before that, `configs/…`. Both
 * redirect there, so a bookmark or an older release's link still resolves.
 * Where the app binds no Customize page, the link lands on the tab root
 * instead (`..`, as above), whose redirect then says there is no list.
 */
const LegacyDetailRedirect = () => {
  const { installation = '', namespace = '', name = '' } = useParams();
  const { search } = useLocation();
  const { modelDetail } = useCustomizePaths();
  const pathname = modelDetail
    ? modelDetail({ installation, namespace, name })
    : '..';
  return <Navigate to={{ pathname, search }} replace />;
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
 *
 * Under a pinned environment the portal does not know (a stale deep link)
 * the views read nothing, and their empty states ("No serving layer", "No
 * GPU inventory") would say something else about the same state: the scope
 * note stands alone instead, and the header's Environment control is the
 * way out.
 */
const HostingView = ({
  kpis,
  children,
}: {
  kpis: ModelHostingKpisScope | undefined;
  children: ReactNode;
}) => {
  const unknownPin = useUnknownScopePin();
  if (unknownPin) {
    return <InstallationScopeNote />;
  }
  return (
    <Flex direction="column" gap="5">
      <ModelHostingSharedIdentityNote />
      {kpis && <ModelHostingKpis scope={kpis} />}
      {children}
    </Flex>
  );
};

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
 * The figures show where a serving layer is in view. The tabs show where one
 * is in view or an environment is pinned: picking one in the header that
 * runs no serving layer changes the view's content, not the frame, so the
 * other tabs stay one click away. Only "All installations" on a portal
 * without a serving layer drops the strip; a deep link there keeps the frame
 * and lets the view's own empty state speak. The Model cache tab is offered
 * where cluster-manager runs, and kept while it is the open view, so a
 * switch of environment never leaves a view without its tab.
 *
 * The views read the section's installation scope, the one Customize's
 * Environment control sets, so the same control leads this header, before
 * the view's actions; `EnvironmentSelect` hides itself with one
 * installation. No `component`: the views read KServe, model-manager and
 * cluster-manager, and no one platform component stands for them. With
 * `kserve`, an environment that runs kagent and model-manager but not KServe
 * would read "no KServe here" over the models it serves.
 *
 * An older release's pool link (`?serve=1&installation=…`) names the serve
 * *target* in `installation`, and the Running models view forwards it at
 * once. The control is left out for it: its URL sync would adopt the target
 * as the section's scope for every tab.
 */
const ShellModelHosting = () => {
  const basePath = useSplatBasePath();
  const { pathname, search } = useLocation();
  const { scope } = useInstallationScope();
  const serving = useServing();
  const servingLayer = hasServingLayer(serving);
  const clusterManager = useClusterManagerAvailability(
    serving.reachableInstallations ?? [],
  );
  const onCache = pathname.replace(/\/$/, '') === `${basePath}/cache`;
  const offersCache =
    clusterManager.available.length > 0 || clusterManager.isLoading || onCache;
  const showTabs = servingLayer || scope !== ALL_INSTALLATIONS;
  // Every environment in view failed to read its served models: a "Models
  // running: 0" tile would claim what the warning below says was not seen.
  const servedModelsUnread = nothingCouldBeRead({
    installations: serving.installations ?? [],
    unreadable: serving.unreachableInstallations ?? [],
  });
  const legacyServeLink = isLegacyServeLink(new URLSearchParams(search));

  return (
    <ShellPage
      title="Model hosting"
      breadcrumbs={[
        { label: 'Customize', href: SHELL_CUSTOMIZE_PATH },
        { label: 'Models', href: `${SHELL_CUSTOMIZE_PATH}/models` },
        { label: 'Model hosting' },
      ]}
      description="Run models on your own GPUs, so data stays in your clusters."
      actions={legacyServeLink ? undefined : <EnvironmentSelect />}
      tabs={showTabs ? shellHostingTabs(offersCache) : undefined}
      // As Usage's tabs: a switch keeps `?installation=`, so each view's
      // address names the environment it shows.
      tabsSearch={search}
    >
      <Routes>
        <Route
          path="serving"
          element={
            <HostingView
              kpis={servingLayer && !servedModelsUnread ? 'all' : undefined}
            >
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
 * The tab's views. The list is the Customize screen's, so the index sends
 * there (one model's former path redirects above, in `ModelsRouter`); the
 * create and edit flows frame themselves; everything else is model hosting.
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
 * tab strip never renders for a location that is about to change, and they
 * sit above the providers, so following an old link starts none of the
 * fleet-wide reads only to navigate away.
 */
export const ModelsRouter = () => {
  return (
    <Routes>
      <Route path="configs" element={<LegacyConfigsRedirect />} />
      <Route path="configs/new" element={<LegacyNewRedirect />} />
      <Route
        path="configs/:installation/:namespace/:name"
        element={<LegacyDetailRedirect />}
      />
      {/* Three segments: no view of the tab has that many (the flows have
          two, editing has four). */}
      <Route
        path=":installation/:namespace/:name"
        element={<LegacyDetailRedirect />}
      />
      <Route
        path="*"
        element={
          <QueryClientProvider>
            <ModelConfigsProvider>
              <ServingProvider>
                <ServedModelRowsProvider>
                  <ModelsViews />
                </ServedModelRowsProvider>
              </ServingProvider>
            </ModelConfigsProvider>
          </QueryClientProvider>
        }
      />
    </Routes>
  );
};
