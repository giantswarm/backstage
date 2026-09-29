import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  containerRegistryApiRef,
  TagInfo,
} from '../../../apis/containerRegistry';
import { OciTagsTable } from './OciTagsTable';

function tag(name: string): TagInfo {
  return { tag: name, createdAt: null };
}

async function renderTable(tags: TagInfo[]) {
  const containerRegistryApi = {
    getTags: jest.fn(async () => ({ tags, latestStableVersion: null })),
    getTagManifest: jest.fn(),
  };

  return renderInTestApp(
    <TestApiProvider apis={[[containerRegistryApiRef, containerRegistryApi]]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <OciTagsTable
          ociRepository="gsoci.azurecr.io/charts/giantswarm/my-app"
          name="my-app"
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

describe('<OciTagsTable />', () => {
  it('shows only stable releases until Show all is on', async () => {
    await renderTable([
      tag('1.3.1-r08a93c50t20260127094959h1a2b3c4'),
      tag('1.3.0-rc.1'),
      tag('1.2.0'),
    ]);

    expect(
      await screen.findByText('Versions of my-app (1 of 3)'),
    ).toBeInTheDocument();
    expect(screen.getByText('1.2.0')).toBeInTheDocument();
    expect(screen.queryByText('1.3.0-rc.1')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Show all' }));

    expect(screen.getByText('Versions of my-app (3)')).toBeInTheDocument();
    expect(screen.getByText('1.3.0-rc.1')).toBeInTheDocument();
    expect(
      screen.getByText('1.3.1-r08a93c50t20260127094959h1a2b3c4'),
    ).toBeInTheDocument();
  });

  it('says so when there is no stable release yet', async () => {
    await renderTable([tag('1.0.0-rc.1')]);

    expect(
      await screen.findByText(/No stable releases yet/),
    ).toBeInTheDocument();
  });
});
