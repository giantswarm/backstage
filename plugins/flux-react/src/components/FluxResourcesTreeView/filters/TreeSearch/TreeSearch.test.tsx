import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
import type { FluxOverviewData } from '../../../FluxOverviewDataProvider';
import { useFluxOverviewData } from '../../../FluxOverviewDataProvider';
import { TreeSearch } from './TreeSearch';

jest.mock('../../../FluxOverviewDataProvider', () => ({
  useFluxOverviewData: jest.fn(),
}));

const mockedUseFluxOverviewData = useFluxOverviewData as jest.MockedFunction<
  typeof useFluxOverviewData
>;

function setData(overrides: Partial<FluxOverviewData> = {}) {
  const data = {
    searchQuery: '',
    setSearchQuery: jest.fn(),
    totalMatches: 0,
    currentMatchIndex: 0,
    navigateToNextMatch: jest.fn(),
    navigateToPreviousMatch: jest.fn(),
    tree: [],
    ...overrides,
  } as unknown as FluxOverviewData;

  mockedUseFluxOverviewData.mockReturnValue(data);

  return data;
}

describe('TreeSearch', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the label and search input', async () => {
    setData();

    await renderInTestApp(<TreeSearch />);

    expect(screen.getByText('Search resources')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Name or failure message'),
    ).toBeInTheDocument();
  });

  it('calls setSearchQuery when the user types', async () => {
    const user = userEvent.setup();
    const data = setData();

    await renderInTestApp(<TreeSearch />);

    await user.type(
      screen.getByPlaceholderText('Name or failure message'),
      'a',
    );

    expect(data.setSearchQuery).toHaveBeenCalledWith('a');
  });

  it('shows the match counter and enables navigation when there are matches', async () => {
    setData({ searchQuery: 'app', totalMatches: 3, currentMatchIndex: 1 });

    await renderInTestApp(<TreeSearch />);

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Previous match' }),
    ).toBeEnabled();
  });

  it('shows "0 hits" and disables navigation when there are no matches', async () => {
    setData({ searchQuery: 'app', totalMatches: 0 });

    await renderInTestApp(<TreeSearch />);

    expect(screen.getByText('0 hits')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Previous match' }),
    ).toBeDisabled();
  });

  it('navigates between matches via the nav buttons', async () => {
    const user = userEvent.setup();
    const data = setData({ searchQuery: 'app', totalMatches: 2 });

    await renderInTestApp(<TreeSearch />);

    await user.click(screen.getByRole('button', { name: 'Next match' }));
    expect(data.navigateToNextMatch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(data.navigateToPreviousMatch).toHaveBeenCalledTimes(1);
  });

  it('focuses the search input on Ctrl/Cmd+F', async () => {
    const user = userEvent.setup();
    setData();

    await renderInTestApp(<TreeSearch />);

    const input = screen.getByPlaceholderText('Name or failure message');
    expect(input).not.toHaveFocus();

    await user.keyboard('{Control>}f{/Control}');

    expect(input).toHaveFocus();
  });

  it('navigates matches on Ctrl/Cmd+G and Ctrl/Cmd+Shift+G', async () => {
    const user = userEvent.setup();
    const data = setData({ searchQuery: 'app', totalMatches: 2 });

    await renderInTestApp(<TreeSearch />);

    await user.keyboard('{Control>}g{/Control}');
    expect(data.navigateToNextMatch).toHaveBeenCalledTimes(1);

    await user.keyboard('{Control>}{Shift>}g{/Shift}{/Control}');
    expect(data.navigateToPreviousMatch).toHaveBeenCalledTimes(1);
  });
});
