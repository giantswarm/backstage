import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { Box, Tab, TabList, Tabs } from '@backstage/ui';
import { useSplatBasePath } from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { ServingProvider, useServing } from '../ServingProvider';
import { ServedModelRowsProvider } from '../ServedModelRowsProvider';
import { ModelConfigsPage } from '../ModelConfigsPage';
import { NewModelPage } from '../NewModelPage';
import { ModelDetailPage } from '../ModelDetailPage';
import { ServingPage } from '../ServingPage';
import { GpuCapacityPage } from '../GpuCapacityPage';

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
 * `..` climbs one *route* -- however many segments -- back to the tab root, the
 * same spelling MusterSection's legacy redirect uses.
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

// The routed view, and the tab strip above it.
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
  const { installations, unreachableInstallations } = useServing();
  const hasServingLayer =
    installations.length > 0 || unreachableInstallations.length > 0;
  const onList = pathname.replace(/\/$/, '') === basePath;
  const showTabs = hasServingLayer || !onList;

  return (
    <>
      {/* Inset the tab strip by the page gutter so it lines up with the level-1
          header tabs and the content below. `px="5"` is hand-matched to the
          horizontal padding the bui PluginHeader / Content apply (bui space-5 =
          20px), the same value MusterSection uses; if bui ever changes that
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
              {hasServingLayer &&
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
        {/* `new` (one segment) can never be swallowed by the three-segment
            detail path: react-router matches on segment count. */}
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
 * tab strip never renders for a location that is about to change. Unlike
 * MusterSection they can sit inside the providers: no provider here writes to
 * the URL, so nothing races the redirect.
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
