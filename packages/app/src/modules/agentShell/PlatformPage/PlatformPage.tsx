import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useMemo } from 'react';
import {
  PlatformClusterRoute,
  PlatformClustersPanel,
  PlatformClustersProvider,
  type PlatformLinks,
  PlatformLinksProvider,
  useMainSessionEnd,
  usePlatformClustersCount,
} from '@giantswarm/backstage-plugin-gs';
import {
  PageHeaderActionsProvider,
  ShellDocumentTitle,
  ShellPage,
} from '@giantswarm/backstage-plugin-ui-react';
import { platformClusterRouteRef, platformRouteRef } from '../routes';
import { PLATFORM_TAB_IDS, type PlatformTabId } from '../platformTabIds';

const PLATFORM_TAB_TITLES: Record<PlatformTabId, string> = {
  clusters: 'Clusters',
};

const DEFAULT_TAB: PlatformTabId = PLATFORM_TAB_IDS[0];

/**
 * This page's own path, through the route ref it is mounted at. It always
 * resolves on this page; rendered anywhere else, it fails loudly rather than
 * link to a guess.
 */
function usePlatformPath(): string {
  const platformLink = useRouteRef(platformRouteRef);
  if (!platformLink) {
    throw new Error('The Platform page is not mounted at platformRouteRef');
  }
  return platformLink();
}

/**
 * The section's addresses for its pages in the gs plugin, through this
 * page's route refs.
 */
function usePlatformLinks(): PlatformLinks {
  const platform = usePlatformPath();
  const clusterLink = useRouteRef(platformClusterRouteRef);
  return useMemo(
    () => ({
      platform,
      clusters: `${platform}/clusters`,
      cluster: params => {
        if (!clusterLink) {
          throw new Error(
            'The Platform page is not mounted at platformRouteRef',
          );
        }
        return clusterLink(params);
      },
    }),
    [platform, clusterLink],
  );
}

/** Opens the first tab, keeping the query string. */
function DefaultTabRedirect() {
  const { search } = useLocation();
  const platform = usePlatformPath();
  return (
    <Navigate to={{ pathname: `${platform}/${DEFAULT_TAB}`, search }} replace />
  );
}

function PlatformTab({ tab }: { tab: PlatformTabId }) {
  const clustersCount = usePlatformClustersCount();
  // Without the portal session nothing can be read, and a count of 0 would
  // claim there is nothing: the count is left out.
  const sessionEnd = useMainSessionEnd();
  const title = PLATFORM_TAB_TITLES[tab];
  return (
    <ShellPage
      title="Platform"
      documentTitle={[title, 'Platform']}
      description="Clusters and the environments that run them."
      tabs={PLATFORM_TAB_IDS.map(id => ({
        id,
        path: id,
        title: PLATFORM_TAB_TITLES[id],
        count: sessionEnd || id !== 'clusters' ? undefined : clustersCount,
      }))}
    >
      <PlatformClustersPanel />
    </ShellPage>
  );
}

/**
 * The shell's Platform section, where the deployment turned it on: a tab per
 * area at `/platform/<tab>`, `/platform` opening the first, and a cluster's
 * page at `/platform/clusters/<installation>/<namespace>/<name>[/<tab>]`.
 * Only Clusters exists so far. Any other address goes to the first tab.
 */
export function PlatformPage() {
  return (
    <PageHeaderActionsProvider>
      {/* Until a tab names itself. */}
      <ShellDocumentTitle title="Platform" />
      <PlatformLinksProvider links={usePlatformLinks()}>
        <Routes>
          <Route index element={<DefaultTabRedirect />} />
          {PLATFORM_TAB_IDS.map(tab => (
            <Route
              key={tab}
              path={tab}
              element={
                // The tab's count and its list read once, on the tab only:
                // a cluster's page reads its own cluster.
                <PlatformClustersProvider>
                  <PlatformTab tab={tab} />
                </PlatformClustersProvider>
              }
            />
          ))}
          <Route
            path="clusters/:installationName/:namespace/:name/*"
            element={<PlatformClusterRoute />}
          />
          <Route path="*" element={<DefaultTabRedirect />} />
        </Routes>
      </PlatformLinksProvider>
    </PageHeaderActionsProvider>
  );
}
