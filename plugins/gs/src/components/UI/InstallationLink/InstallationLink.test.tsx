import { renderInTestApp } from '@backstage/frontend-test-utils';
import { catalogApiRef, entityRouteRef } from '@backstage/plugin-catalog-react';
import { catalogApiMock } from '@backstage/plugin-catalog-react/testUtils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { InstallationLink } from './InstallationLink';

function renderLinks() {
  const catalogApi = catalogApiMock({
    entities: [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'gazelle', namespace: 'default' },
        spec: { type: 'installation', owner: 'team-a' },
      },
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'golem', namespace: 'default' },
        spec: { type: 'database', owner: 'team-a' },
      },
    ],
  });
  const getEntities = jest.spyOn(catalogApi, 'getEntities');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <ul>
        <li>
          <InstallationLink installationName="gazelle" />
        </li>
        <li>
          <InstallationLink installationName="golem" />
        </li>
        <li>
          <InstallationLink installationName="grizzly" />
        </li>
      </ul>
    </QueryClientProvider>,
    {
      apis: [[catalogApiRef, catalogApi]],
      mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef },
    },
  );
  return { rendered, getEntities };
}

describe('InstallationLink', () => {
  it('links an installation with a catalog entity to its catalog page', async () => {
    renderLinks();

    const link = await screen.findByRole('link', { name: 'gazelle' });
    expect(link).toHaveAttribute('href', '/catalog/default/resource/gazelle');
  });

  it('renders the link as the bare name, underlined, so the text keeps its place', async () => {
    renderLinks();

    const link = await screen.findByRole('link', { name: 'gazelle' });
    expect(link).toHaveTextContent(/^gazelle$/);
    expect(link.querySelector('svg')).toBeNull();
    expect(link.className).toMatch(/underlineAlways/);
  });

  it('shows the plain name while the catalog has not answered', async () => {
    renderLinks();

    expect(await screen.findByText('gazelle')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await screen.findByRole('link', { name: 'gazelle' });
  });

  it('shows the plain name of an installation without an installation entity', async () => {
    renderLinks();

    await screen.findByRole('link', { name: 'gazelle' });
    // `golem` is a Resource of another type, `grizzly` is not in the catalog.
    expect(screen.getByText('golem')).toBeInTheDocument();
    expect(screen.getByText('grizzly')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('asks the catalog once for every link on the page', async () => {
    const { getEntities } = renderLinks();

    await screen.findByRole('link', { name: 'gazelle' });
    await waitFor(() => expect(getEntities).toHaveBeenCalledTimes(1));
    expect(getEntities).toHaveBeenCalledWith({
      filter: {
        kind: 'resource',
        'metadata.namespace': 'default',
        'spec.type': 'installation',
      },
      fields: ['metadata.name'],
    });
  });
});
