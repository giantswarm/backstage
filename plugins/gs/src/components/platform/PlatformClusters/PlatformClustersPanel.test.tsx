import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  type MockedLayout,
  mockDesktopLayout,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import type {
  ClusterData,
  UnlistedInstallation,
} from '../../clusters/ClustersDataProvider';
import { PlatformClustersPanel } from './PlatformClustersPanel';
import {
  DEFAULT_PLATFORM_CLUSTER_COLUMNS,
  type PlatformClusterColumn,
} from './platformClusterColumns';

function cluster(name: string, data: Partial<ClusterData> = {}): ClusterData {
  return {
    installationName: 'meadow',
    namespace: 'org-fern',
    name,
    type: 'workload',
    organization: 'fern',
    status: 'ready',
    apiVersion: 'cluster.x-k8s.io/v1beta2',
    releaseVersion: '31.1.0',
    kubernetesVersion: 'v1.31.7',
    created: '2026-01-02T00:00:00Z',
    ...data,
  };
}

let mockData: ClusterData[];
let mockUnlisted: UnlistedInstallation[];
let mockLoading: boolean;
let mockVisible: PlatformClusterColumn[];
const mockSetVisible = jest.fn();
const mockSignInAgain = jest.fn();
let mockAccess: { installation: string; state: string }[];

jest.mock('../../clusters/ClustersDataProvider', () => ({
  useClustersData: () => ({
    data: mockData,
    unlistedInstallations: mockUnlisted,
  }),
}));
jest.mock('./PlatformClustersProvider', () => ({
  usePlatformClustersLoading: () => mockLoading,
  usePlatformClustersState: () => ({
    visibleColumns: mockVisible,
    setVisibleColumns: mockSetVisible,
  }),
}));
jest.mock('../../../apis/clusterAccessStatus', () => ({
  useClusterAccessStatus: () => mockAccess,
  useSignInAgain: () => mockSignInAgain,
}));
jest.mock('../../hooks/useK8sVersionEOLDate', () => ({
  useK8sVersionEOLDate: (version?: string) =>
    version?.startsWith('v1.30') ? '2025-06-28' : null,
}));

const clusters = [
  cluster('meadow', {
    namespace: 'org-giantswarm',
    type: 'management',
    organization: 'giantswarm',
  }),
  cluster('alder-birch', { installationName: 'fennel' }),
  cluster('cedar-elm', {
    status: 'creating',
    releaseVersion: '30.1.2',
    kubernetesVersion: 'v1.30.11',
  }),
  cluster('dock-fern', { status: 'deleting' }),
];

function headers(): string[] {
  return screen
    .getAllByRole('columnheader')
    .map(header => header.textContent ?? '');
}

function names(): string[] {
  return screen.getAllByRole('rowheader').map(cell => cell.textContent ?? '');
}

describe('PlatformClustersPanel', () => {
  let layout: MockedLayout;

  beforeEach(() => {
    layout = mockDesktopLayout();
    mockData = clusters;
    mockUnlisted = [];
    mockLoading = false;
    mockVisible = [...DEFAULT_PLATFORM_CLUSTER_COLUMNS];
    mockAccess = [];
    mockSetVisible.mockReset();
  });

  afterEach(() => layout.restore());

  it('lists every cluster by name with the default columns', async () => {
    await renderInTestApp(<PlatformClustersPanel />);
    expect(headers()).toEqual([
      'Name',
      'Status',
      'Environment',
      'Organization',
      'Release',
      'Workers',
      'Created',
    ]);
    expect(names()).toEqual([
      expect.stringContaining('alder-birch'),
      expect.stringContaining('cedar-elm'),
      expect.stringContaining('dock-fern'),
      expect.stringContaining('meadow'),
    ]);
    expect(
      screen.getByRole('img', { name: 'Management cluster' }),
    ).toBeInTheDocument();
  });

  it('does not make rows links yet', async () => {
    await renderInTestApp(<PlatformClustersPanel />);
    const table = screen.getByRole('grid');
    expect(within(table).queryAllByRole('link')).toHaveLength(0);
  });

  it('shows each state with its label and marks a Kubernetes version past its end of life', async () => {
    await renderInTestApp(<PlatformClustersPanel />);
    const row = screen.getByRole('row', { name: /cedar-elm/ });
    expect(within(row).getByText('Creating')).toBeInTheDocument();
    expect(within(row).getByText('30.1.2')).toBeInTheDocument();
    expect(within(row).getByText('EOL')).toBeInTheDocument();
    const other = screen.getByRole('row', { name: /alder-birch/ });
    expect(within(other).queryByText('EOL')).not.toBeInTheDocument();
  });

  it('sorts by a header and reverses on a second press', async () => {
    await renderInTestApp(<PlatformClustersPanel />);
    await userEvent.click(
      screen.getByRole('columnheader', { name: /Environment/ }),
    );
    expect(names()[0]).toContain('alder-birch');
    await userEvent.click(
      screen.getByRole('columnheader', { name: /Environment/ }),
    );
    expect(names()[names().length - 1]).toContain('alder-birch');
  });

  it('offers the filters and the search once the list is long enough', async () => {
    await renderInTestApp(<PlatformClustersPanel />);
    expect(
      screen.getByRole('searchbox', { name: 'Search clusters' }),
    ).toBeInTheDocument();
    for (const field of ['environment', 'organization', 'status']) {
      expect(
        screen.getByRole('button', { name: new RegExp(`Filter by ${field}`) }),
      ).toBeInTheDocument();
    }
  });

  it('says when a search matches nothing', async () => {
    await renderInTestApp(<PlatformClustersPanel />);
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search clusters' }),
      'zzz',
    );
    expect(screen.getByText('No clusters match “zzz”.')).toBeInTheDocument();
  });

  it('shows the columns a person chose and saves a change from the picker', async () => {
    mockVisible = ['status', 'region'];
    await renderInTestApp(<PlatformClustersPanel />);
    expect(headers()).toEqual(['Name', 'Status', 'Region']);

    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    const picker = await screen.findByRole('listbox', { name: 'Columns' });
    expect(
      within(picker).getByRole('option', { name: 'Name' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(
      within(picker).getByRole('option', { name: 'Provider' }),
    );
    expect(mockSetVisible).toHaveBeenCalledWith(
      expect.arrayContaining(['status', 'region', 'provider']),
    );
    expect(mockSetVisible.mock.calls[0][0]).not.toContain('name');
  });

  it('reads while nothing has arrived', async () => {
    mockData = [];
    mockLoading = true;
    await renderInTestApp(<PlatformClustersPanel />);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.queryByText('No clusters yet')).not.toBeInTheDocument();
  });

  it('says when there are no clusters', async () => {
    mockData = [];
    await renderInTestApp(<PlatformClustersPanel />);
    expect(screen.getByText('No clusters yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Columns' }),
    ).not.toBeInTheDocument();
  });

  it('names the environments whose clusters could not be read, with a sign-in where it expired', async () => {
    mockUnlisted = [
      { installation: 'fennel', reason: 'API unreachable (timeout)' },
      { installation: 'tarragon', reason: 'Access forbidden' },
    ];
    mockAccess = [{ installation: 'tarragon', state: 'session-expired' }];
    await renderInTestApp(<PlatformClustersPanel />);
    expect(
      screen.getByText('Clusters in fennel are not listed.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Reading them failed: API unreachable (timeout).'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your sign-in to tarragon has expired.'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in again' }),
    );
    expect(mockSignInAgain).toHaveBeenCalled();
  });

  it('counts the environments beyond the third that could not be read', async () => {
    mockUnlisted = ['a', 'b', 'c', 'd', 'e'].map(installation => ({
      installation,
      reason: 'Access forbidden',
    }));
    await renderInTestApp(<PlatformClustersPanel />);
    expect(screen.getAllByText(/are not listed\.$/)).toHaveLength(3);
    expect(
      screen.getByText(
        'Clusters in 2 more environments are not listed either.',
      ),
    ).toBeInTheDocument();
  });

  it('stacks the clusters at phone width, without the column picker', async () => {
    layout.restore();
    layout = mockPhoneLayout();
    await renderInTestApp(<PlatformClustersPanel />);
    const list = screen.getByRole('list', { name: 'Clusters' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[1].textContent).toContain('cedar-elm');
    expect(items[1].textContent).toContain('Creating');
    expect(items[1].textContent).toMatch(/meadow.*fern.*30\.1\.2/);
    expect(
      screen.queryByRole('button', { name: 'Columns' }),
    ).not.toBeInTheDocument();
  });
});
