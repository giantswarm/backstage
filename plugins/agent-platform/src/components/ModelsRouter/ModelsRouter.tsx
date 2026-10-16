import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Flex } from '@backstage/ui';
import { useRouteRef } from '@backstage/frontend-plugin-api';
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
import { ShellCustomizeRedirect } from '../ShellCustomizeRedirect';
import { CustomizeModelPage } from '../CustomizeModelPage';
import { useClusterManagerAvailability } from '../../hooks/useClusterManager';
import { ModelHostingSharedIdentityNote } from '../ModelHostingSharedIdentity';
import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { isLegacyServeLink } from '../../lib/modelManagerServe';
import { nothingCouldBeRead } from '../../lib/soleInstallation';
import { servingRouteRef } from '../../routes';

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
    // The bare `hosting`.
    { id: 'serving', path: '', title: 'Running models' },
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
  const { customize, models } = useCustomizePaths();

  return (
    <ShellPage
      title="Model hosting"
      breadcrumbs={[
        { label: 'Customize', href: customize },
        { label: 'Models', href: models },
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
          index
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
        {/* A guess lands on the first view, the nearest valid parent,
            rather than on the frame over an empty page. Absolute, from the
            splat base path: a relative target inside a splat route would
            append. */}
        <Route
          path="*"
          element={<Navigate to={{ pathname: basePath, search }} replace />}
        />
      </Routes>
    </ShellPage>
  );
};

/**
 * The Models tab's providers. They wrap every view, so switching views
 * neither remounts them nor refetches (every route below renders this same
 * element type, which React keeps across a switch): the served-model rows
 * (with the auto-wiring that completes a serve) keep running whichever view
 * is open — a model served from Running models still gets its ModelConfig
 * while the user waits for it on the list.
 */
const ModelsProviders = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider>
    <ModelConfigsProvider>
      <ServingProvider>
        <ServedModelRowsProvider>{children}</ServedModelRowsProvider>
      </ServingProvider>
    </ModelConfigsProvider>
  </QueryClientProvider>
);

/** A view under the tab's providers. */
const view = (element: ReactNode) => (
  <ModelsProviders>{element}</ModelsProviders>
);

/** An unknown address below `hosting`: Running models, its nearest parent. */
const HostingRedirect = () => {
  const servingRoute = useRouteRef(servingRouteRef);
  const { search } = useLocation();
  return servingRoute ? (
    <Navigate to={{ pathname: servingRoute(), search }} replace />
  ) : null;
};

/** An unknown step of a model's edit: the edit itself, its nearest parent. */
const EditRedirect = () => <Navigate to="." replace />;

/**
 * Content of the Customize screen's Models tab below its list (a descendant
 * `<Routes>`, so the paths here are relative — no leading slash — matching
 * AgentsRouter): one model's page at `<installation>/<namespace>/<name>` with
 * its tabs, its edit at `…/<name>/edit`, the create flow at `new` and Model
 * hosting at `hosting/…`, its create flows framing themselves. `new` and
 * `hosting` are reserved words: no installation can be named so.
 *
 * One `<Routes>`, so react-router ranks every path against the model page's
 * three dynamic segments: a static segment outranks a dynamic one at the
 * same depth, and `hosting/:view/:rest/*` keeps any three-segment address
 * under `hosting` from reading as a model on an installation named
 * `hosting`. ModelsRouter.test.tsx holds the rankings.
 *
 * The model's page mounts only the agent-platform data it reads
 * (`CustomizeModelPage`); the views share the tab's providers. Both share one
 * query client, so the list's reads are cache hits on the page.
 */
export const ModelsRouter = () => {
  return (
    <Routes>
      <Route path="new" element={view(<NewModelPage />)} />
      <Route path="hosting/serve" element={view(<ServeModelRoute />)} />
      <Route path="hosting/import" element={view(<ImportModelRoute />)} />
      <Route path="hosting/pull" element={view(<PullModelRoute />)} />
      <Route
        path="hosting/add-backend"
        element={view(<AddModelBackendRoute />)}
      />
      <Route
        path="hosting/capacity/add-pool"
        element={view(<AddGpuNodePoolRoute />)}
      />
      <Route path="hosting/:view/:rest/*" element={<HostingRedirect />} />
      <Route path="hosting/*" element={view(<ShellModelHosting />)} />
      <Route
        path=":installation/:namespace/:name/edit"
        element={view(<EditModelPage />)}
      />
      <Route
        path=":installation/:namespace/:name/edit/*"
        element={<EditRedirect />}
      />
      <Route
        path=":installation/:namespace/:name/*"
        element={<CustomizeModelPage />}
      />
      <Route path="*" element={<ShellCustomizeRedirect tab="models" />} />
    </Routes>
  );
};
