import { useState } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { catalogApiRef, entityRouteRef } from '@backstage/plugin-catalog-react';
import { catalogApiMock } from '@backstage/plugin-catalog-react/testUtils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react';
import { InstallationLink } from './InstallationLink';

function Links() {
  const [more, setMore] = useState(false);
  return (
    <>
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
        <li>
          <InstallationLink installationName="goose" />
        </li>
        {more && (
          <li>
            <InstallationLink installationName="gazelle" />
          </li>
        )}
      </ul>
      <button onClick={() => setMore(true)}>More rows</button>
    </>
  );
}

async function renderLinks({ stalled = false } = {}) {
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
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'Goose', namespace: 'default' },
        spec: { type: 'installation', owner: 'team-a' },
      },
    ],
  });
  const getEntities = jest.spyOn(catalogApi, 'getEntities');
  if (stalled) {
    getEntities.mockReturnValue(new Promise(() => {}));
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <Links />
    </QueryClientProvider>,
    {
      apis: [[catalogApiRef, catalogApi]],
      mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef },
    },
  );
  return { getEntities };
}

describe('InstallationLink', () => {
  it('links an installation with a catalog entity to its catalog page', async () => {
    await renderLinks();

    const link = await screen.findByRole('link', { name: 'gazelle' });
    expect(link).toHaveAttribute('href', '/catalog/default/resource/gazelle');
  });

  it('renders the link as the bare name, underlined, so the text keeps its place', async () => {
    await renderLinks();

    const link = await screen.findByRole('link', { name: 'gazelle' });
    expect(link).toHaveTextContent(/^gazelle$/);
    expect(link.querySelector('svg')).toBeNull();
    expect(link.className).toMatch(/underlineAlways/);
  });

  it('matches the entity name whatever its case, as the catalog does', async () => {
    await renderLinks();

    expect(await screen.findByRole('link', { name: 'goose' })).toHaveAttribute(
      'href',
      '/catalog/default/resource/goose',
    );
  });

  it('shows the plain name, marked pending, while the catalog has not answered', async () => {
    await renderLinks({ stalled: true });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('gazelle')).toHaveAttribute(
      'data-installation-entity',
      'pending',
    );
  });

  it('shows the plain name of an installation without an installation entity', async () => {
    await renderLinks();

    await screen.findByRole('link', { name: 'gazelle' });
    // `golem` is a Resource of another type, `grizzly` is not in the catalog.
    expect(screen.getByText('golem')).toHaveAttribute(
      'data-installation-entity',
      'none',
    );
    expect(screen.getByText('grizzly')).toHaveAttribute(
      'data-installation-entity',
      'none',
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('asks the catalog once, also for links that mount after the answer', async () => {
    const { getEntities } = await renderLinks();

    await screen.findByRole('link', { name: 'gazelle' });
    fireEvent.click(screen.getByRole('button', { name: 'More rows' }));
    expect(
      await screen.findAllByRole('link', { name: 'gazelle' }),
    ).toHaveLength(2);

    expect(getEntities).toHaveBeenCalledTimes(1);
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
