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

// The Models views, as a second-level tab row under the Agent Platform page's
// "Models" tab — the same shape as the muster section's MusterSection. Model
// configs is first, so the tab index redirects to it.
const MODEL_CONFIGS_VIEW = { path: 'configs', title: 'Model configs' } as const;
const SERVING_VIEWS = [
  { path: 'serving', title: 'Serving' },
  { path: 'capacity', title: 'GPU capacity' },
] as const;

/** Sends the tab index to the first view, keeping the query string. */
const IndexRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: 'configs', search }} replace />;
};

/**
 * The create and detail flows used to live directly under `/models` (`/new`
 * and `/<installation>/<namespace>/<name>`); they are sub-routes of the Model
 * configs view now. Redirect the old deep links so a bookmarked model or a
 * link from an older release still resolves.
 *
 * Both are spelled `../configs/…`: a relative `Navigate` resolves against the
 * route it renders in (`new`, or the three-segment detail pattern), and `..`
 * climbs one *route* — however many segments — back to the tab root. Same as
 * MusterSection's legacy redirect.
 */
const LegacyNewRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '../configs/new', search }} replace />;
};

const LegacyDetailRedirect = () => {
  const { installation = '', namespace = '', name = '' } = useParams();
  const { search } = useLocation();
  return (
    <Navigate
      to={{
        pathname: `../configs/${[installation, namespace, name]
          .map(encodeURIComponent)
          .join('/')}`,
        search,
      }}
      replace
    />
  );
};

// The tab strip plus the routed view. The tabs are navigation links whose
// active state follows the route (`matchStrategy`); the content is driven by the
// router below, not by TabPanels. The two serving views only appear once a
// reachable installation has a serving layer this portal can see (or could not
// be asked) — a portal without one never shows a Serving tab, the same rule the
// Serving section followed while it lived on the list page. Their routes stay
// mounted regardless, so a deep link renders the view's own empty state.
const ModelsViews = () => {
  const basePath = useSplatBasePath();
  const { installations, unreachableInstallations } = useServing();
  const hasServingLayer =
    installations.length > 0 || unreachableInstallations.length > 0;
  const views = hasServingLayer
    ? [MODEL_CONFIGS_VIEW, ...SERVING_VIEWS]
    : [MODEL_CONFIGS_VIEW];

  return (
    <>
      {/* Inset the tab strip by the page gutter so it lines up with the level-1
          header tabs and the content below. `px="5"` is hand-matched to the
          horizontal padding the bui PluginHeader / Content apply (bui space-5 =
          20px), the same value MusterSection uses; if bui ever changes that
          gutter both have to follow. */}
      <Box px="5">
        <Tabs>
          <TabList>
            {views.map(view => (
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
        <Route path="configs" element={<ModelConfigsPage />} />
        <Route path="configs/new" element={<NewModelPage />} />
        {/* `configs/new` (two segments) can never be swallowed by the
            four-segment detail path: react-router matches on segment count and
            ranks static segments above dynamic ones. */}
        <Route
          path="configs/:installation/:namespace/:name"
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
 * The index redirect and the legacy redirects are siblings of the views, not
 * routes inside them, so the tab strip never renders for a location that is
 * about to change. Unlike MusterSection they can sit inside the providers: no
 * provider here writes to the URL, so nothing races the redirect.
 */
export const ModelsRouter = () => {
  return (
    <QueryClientProvider>
      <ModelConfigsProvider>
        <ServingProvider>
          <ServedModelRowsProvider>
            <Routes>
              <Route index element={<IndexRedirect />} />
              <Route path="new" element={<LegacyNewRedirect />} />
              <Route
                path=":installation/:namespace/:name"
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
