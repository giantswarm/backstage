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
import { OciTagsListCard } from './OciTagsListCard';

function tag(name: string): TagInfo {
  return { tag: name, createdAt: null };
}

async function renderCard(tags: TagInfo[]) {
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
        <OciTagsListCard ociRepository="gsoci.azurecr.io/charts/giantswarm/my-app" />
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

describe('<OciTagsListCard />', () => {
  it('links to the full version history below the list', async () => {
    await renderCard([tag('1.2.0')]);

    expect(
      await screen.findByRole('link', { name: 'View all versions →' }),
    ).toHaveAttribute('href', expect.stringMatching(/version-history$/));
  });

  it('lists only stable releases until Show all is on', async () => {
    await renderCard([
      tag('1.3.1-r08a93c50t20260127094959h1a2b3c4'),
      tag('1.3.0-rc.1'),
      tag('1.2.0'),
    ]);

    expect(await screen.findByText('1.2.0')).toBeInTheDocument();
    expect(screen.queryByText('1.3.0-rc.1')).not.toBeInTheDocument();
    expect(
      screen.queryByText('1.3.1-r08a93c50t20260127094959h1a2b3c4'),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Show all' }));

    expect(screen.getByText('1.3.0-rc.1')).toBeInTheDocument();
    expect(
      screen.getByText('1.3.1-r08a93c50t20260127094959h1a2b3c4'),
    ).toBeInTheDocument();
  });

  it('fills its five rows with stable releases behind newer dev builds', async () => {
    await renderCard([
      ...Array.from({ length: 6 }, (_, i) =>
        tag(`2.0.0-r08a93c50t2026012709495${i}h1a2b3c4`),
      ),
      ...['1.5.0', '1.4.0', '1.3.0', '1.2.0', '1.1.0', '1.0.0'].map(tag),
    ]);

    expect(await screen.findByText('1.5.0')).toBeInTheDocument();
    expect(screen.getByText('1.1.0')).toBeInTheDocument();
    expect(screen.queryByText('1.0.0')).not.toBeInTheDocument();
  });

  it('offers Show all only when the repository has tags', async () => {
    await renderCard([]);

    expect(await screen.findByText('No tags found')).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Show all' }),
    ).not.toBeInTheDocument();
  });

  it('says so when there is no stable release yet', async () => {
    await renderCard([tag('1.0.0-rc.1')]);

    expect(
      await screen.findByText(/No stable releases yet/),
    ).toBeInTheDocument();
  });
});
