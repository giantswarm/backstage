import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  FilterToolsOptions,
  FilterToolsResponse,
  MusterApi,
  musterApiRef,
} from '../../apis';
import { ToolBrowser } from './ToolBrowser';
import { ToolPrefs } from './useToolPrefs';

const browseResponse: FilterToolsResponse = {
  total: 2,
  filtered_count: 2,
  truncated: false,
  tools: [
    { name: 'core_list_installations', summary: 'List installations' },
    { name: 'workflow_deploy', summary: 'Deploy something' },
  ],
};

const searchResponse: FilterToolsResponse = {
  total: 1,
  filtered_count: 1,
  truncated: false,
  tools: [{ name: 'core_search_hit', summary: 'A match', score: 7 }],
};

function makeApi(): jest.Mocked<Pick<MusterApi, 'filterTools'>> {
  return {
    filterTools: jest.fn((options?: FilterToolsOptions) =>
      Promise.resolve(options?.query ? searchResponse : browseResponse),
    ),
  };
}

const prefs: ToolPrefs = {
  favourites: [],
  recents: [],
  isFavourite: () => false,
  toggleFavourite: jest.fn(),
  pushRecent: jest.fn(),
};

async function renderBrowser(
  api: Pick<MusterApi, 'filterTools'>,
  onSelect = jest.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <ToolBrowser onSelect={onSelect} servers={[]} prefs={prefs} />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { onSelect };
}

describe('ToolBrowser', () => {
  it('renders browse groups and selects a tool on click', async () => {
    const api = makeApi();
    const { onSelect } = await renderBrowser(api);

    // The Core group is expanded by default, so its tool row is visible.
    const row = await screen.findByText('core_list_installations');
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('core_list_installations');
  });

  it('switches to ranked search results when the query is non-empty', async () => {
    const api = makeApi();
    await renderBrowser(api);

    await screen.findByText('core_list_installations');
    await userEvent.type(screen.getByRole('searchbox'), 'match');

    expect(await screen.findByText('core_search_hit')).toBeInTheDocument();
    await waitFor(() =>
      expect(api.filterTools).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'match' }),
      ),
    );
  });
});
