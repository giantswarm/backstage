import { renderInTestApp } from '@backstage/frontend-test-utils';
import { catalogApiRef, entityRouteRef } from '@backstage/plugin-catalog-react';
import { catalogApiMock } from '@backstage/plugin-catalog-react/testUtils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { installationsRouteRef } from '../../../routes';
import { InstallationLink } from './InstallationLink';

const catalogApi = catalogApiMock({
  entities: [
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'gazelle', namespace: 'default' },
      spec: { type: 'installation', owner: 'team-a' },
    },
  ],
});

function renderLinks({ installationsPage }: { installationsPage: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <ul>
        <li>
          <InstallationLink installationName="gazelle" />
        </li>
        <li>
          <InstallationLink installationName="golem" />
        </li>
      </ul>
    </QueryClientProvider>,
    {
      apis: [[catalogApiRef, catalogApi]],
      mountedRoutes: {
        '/catalog/:namespace/:kind/:name': entityRouteRef,
        ...(installationsPage
          ? { '/installations': installationsRouteRef }
          : {}),
      },
    },
  );
}

describe('InstallationLink', () => {
  it('links an installation to its catalog entity where the installations page is enabled', async () => {
    await renderLinks({ installationsPage: true });

    expect(
      await screen.findByRole('link', { name: 'gazelle' }),
    ).toHaveAttribute('href', '/catalog/default/resource/gazelle');
  });

  it('shows the plain name of an installation without a catalog entity', async () => {
    await renderLinks({ installationsPage: true });

    await screen.findByRole('link', { name: 'gazelle' });
    expect(screen.getByText('golem')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'golem' }),
    ).not.toBeInTheDocument();
  });

  it('shows plain names where the installations page is disabled', async () => {
    await renderLinks({ installationsPage: false });

    expect(screen.getByText('gazelle')).toBeInTheDocument();
    expect(screen.getByText('golem')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
