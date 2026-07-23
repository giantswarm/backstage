import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import type { FluxOverviewData } from '../FluxOverviewDataProvider';
import { useFluxOverviewData } from '../FluxOverviewDataProvider';
import { FluxOverview } from './FluxOverview';

jest.mock('../FluxOverviewDataProvider', () => ({
  useFluxOverviewData: jest.fn(),
}));

const mockedUseFluxOverviewData = useFluxOverviewData as jest.MockedFunction<
  typeof useFluxOverviewData
>;

function setData(overrides: Partial<FluxOverviewData> = {}) {
  mockedUseFluxOverviewData.mockReturnValue({
    tree: undefined,
    isLoading: false,
    resourceType: 'all',
    statusFilter: 'all',
    searchMatches: [],
    currentMatchId: undefined,
    pathsToExpand: new Set<string>(),
    ...overrides,
  } as unknown as FluxOverviewData);
}

const noop = () => {};

describe('FluxOverview', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows a progress indicator while loading', async () => {
    setData({ isLoading: true });

    await renderInTestApp(
      <FluxOverview selectedResourceRef={null} onSelectResource={noop} />,
    );

    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('prompts to select a cluster when there is no tree', async () => {
    setData({ isLoading: false, tree: undefined });

    await renderInTestApp(
      <FluxOverview selectedResourceRef={null} onSelectResource={noop} />,
    );

    expect(screen.getByText('No information to display')).toBeInTheDocument();
  });

  it('shows an empty state when the tree has no resources', async () => {
    setData({ isLoading: false, tree: [] });

    await renderInTestApp(
      <FluxOverview selectedResourceRef={null} onSelectResource={noop} />,
    );

    expect(screen.getByText('No resources to display')).toBeInTheDocument();
  });

  it('shows a failing-specific empty state when filtering by failing', async () => {
    setData({ isLoading: false, tree: [], statusFilter: 'failing' });

    await renderInTestApp(
      <FluxOverview selectedResourceRef={null} onSelectResource={noop} />,
    );

    expect(screen.getByText('No failing resources')).toBeInTheDocument();
  });
});
