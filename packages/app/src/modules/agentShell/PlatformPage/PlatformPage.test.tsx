import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { platformRouteRef } from '../routes';
import { PlatformPage } from './PlatformPage';

const MockLinks = createContext<
  | {
      platform: string;
      clusters: string;
      cluster: (address: {
        installationName: string;
        namespace: string;
        name: string;
      }) => string;
    }
  | undefined
>(undefined);

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useMainSessionEnd: () => undefined,
  usePlatformClustersCount: () => 2,
  PlatformClustersProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="clusters-provider">{children}</div>
  ),
  PlatformLinksProvider: ({
    links,
    children,
  }: {
    links: React.ContextType<typeof MockLinks>;
    children: ReactNode;
  }) => <MockLinks.Provider value={links}>{children}</MockLinks.Provider>,
  PlatformClustersPanel: () => {
    const links = useContext(MockLinks)!;
    return (
      <a
        href={links.cluster({
          installationName: 'meadow',
          namespace: 'org-fern',
          name: 'alder-birch',
        })}
      >
        alder-birch
      </a>
    );
  },
  PlatformClusterRoute: () => {
    const { installationName, namespace, name } = useParams();
    const links = useContext(MockLinks)!;
    return (
      <div data-testid="cluster-page">
        {installationName}/{namespace}/{name}
        <a href={links.clusters}>Clusters</a>
      </div>
    );
  },
}));

function renderAt(path: string) {
  return renderInTestApp(
    <Routes>
      <Route path="/platform/*" element={<PlatformPage />} />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/platform': platformRouteRef },
    },
  );
}

describe('PlatformPage', () => {
  it('links the clusters list to each cluster’s page', async () => {
    await renderAt('/platform/clusters');

    expect(screen.getByTestId('clusters-provider')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'alder-birch' })).toHaveAttribute(
      'href',
      '/platform/clusters/meadow/org-fern/alder-birch',
    );
  });

  it('opens a cluster’s page at its address, under the list’s provider', async () => {
    await renderAt('/platform/clusters/meadow/org-fern/alder-birch');

    expect(screen.getByTestId('cluster-page')).toHaveTextContent(
      'meadow/org-fern/alder-birch',
    );
    // Above both routes, so the list's clusters and view outlive the visit.
    expect(screen.getByTestId('clusters-provider')).toContainElement(
      screen.getByTestId('cluster-page'),
    );
    expect(screen.getByRole('link', { name: 'Clusters' })).toHaveAttribute(
      'href',
      '/platform/clusters',
    );
  });

  it('keeps a cluster page’s tab in its address', async () => {
    await renderAt('/platform/clusters/meadow/org-fern/alder-birch/node-pools');

    expect(screen.getByTestId('cluster-page')).toBeInTheDocument();
  });

  it('sends an address that names no cluster to the list', async () => {
    await renderAt('/platform/clusters/meadow');

    expect(
      await screen.findByRole('link', { name: 'alder-birch' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-page')).not.toBeInTheDocument();
  });
});
