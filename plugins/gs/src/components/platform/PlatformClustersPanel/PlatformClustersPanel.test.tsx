import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { getClusterKey } from '../../hooks/useWorkerCapacity';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  type MockedLayout,
  mockDesktopLayout,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import type {
  ClusterData,
  RelatedReadFailures,
  UnlistedInstallation,
} from '../../clusters/ClustersDataProvider';
import type {
  PlatformClustersStatus,
  PlatformClustersView,
} from '../PlatformClustersProvider';
import { type PlatformLinks, PlatformLinksProvider } from '../PlatformLinks';
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
    // As a KubeadmControlPlane reports it, with the `v`.
    kubernetesVersion: 'v1.31.7',
    created: '2026-01-02T00:00:00Z',
    ...data,
  };
}

let mockData: ClusterData[];
let mockUnlisted: UnlistedInstallation[];
let mockReading: boolean;
let mockRelated: Record<string, RelatedReadFailures>;
const mockRetry = jest.fn();
let mockStatus: PlatformClustersStatus;
let mockVisible: PlatformClusterColumn[];
const mockSetVisible = jest.fn();
const mockRetryInstallations = jest.fn();
const mockSignInAgain = jest.fn();
let mockAccess: { installation: string; state: string }[];

jest.mock('../../clusters/ClustersDataProvider', () => ({
  useClustersData: () => ({
    data: mockData,
    unlistedInstallations: mockUnlisted,
    isReadingClusters: mockReading,
    relatedReadFailures: mockRelated,
    retry: mockRetry,
  }),
}));
const mockStart = jest.fn();
let mockInitialView: PlatformClustersView;
/** The provider's view, held in React state as the provider holds it. */
const mockViewContext = createContext<{
  view: PlatformClustersView;
  updateView: (change: Partial<PlatformClustersView>) => void;
}>({ view: {} as PlatformClustersView, updateView: () => {} });
jest.mock('../PlatformClustersProvider', () => ({
  usePlatformClustersState: () => ({
    status: mockStatus,
    installationsError: new Error('the backend answered 500'),
    retryInstallations: mockRetryInstallations,
    visibleColumns: mockVisible,
    setVisibleColumns: mockSetVisible,
    start: mockStart,
    ...useContext(mockViewContext),
  }),
}));

function ViewState({ children }: { children: ReactNode }) {
  const [view, setView] = useState(mockInitialView);
  const updateView = useCallback(
    (change: Partial<PlatformClustersView>) =>
      setView(current => ({ ...current, ...change })),
    [],
  );
  return (
    <mockViewContext.Provider value={{ view, updateView }}>
      {children}
    </mockViewContext.Provider>
  );
}

const LINKS: PlatformLinks = {
  platform: '/platform',
  clusters: '/platform/clusters',
  cluster: ({ installationName, namespace, name }) =>
    `/platform/clusters/${installationName}/${namespace}/${name}`,
};

/** The panel under the view state, with the section's links or without. */
function panel({ links = true }: { links?: boolean } = {}) {
  return (
    <ViewState>
      {links ? (
        <PlatformLinksProvider links={LINKS}>
          <PlatformClustersPanel />
        </PlatformLinksProvider>
      ) : (
        <PlatformClustersPanel />
      )}
    </ViewState>
  );
}
jest.mock('../../../apis/clusterAccessStatus', () => ({
  useClusterAccessStatus: () => mockAccess,
  useSignInAgain: () => mockSignInAgain,
}));
// Keyed as `gs.kubernetesVersions` is: by the minor version, without a `v`.
jest.mock('../../hooks/useK8sVersionEOLDate', () => ({
  useK8sVersionEOLDate: (version?: string) =>
    version?.startsWith('1.30') ? '2025-06-28' : null,
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
    mockReading = false;
    mockRelated = {};
    mockStatus = 'ready';
    mockVisible = [...DEFAULT_PLATFORM_CLUSTER_COLUMNS];
    mockAccess = [];
    mockInitialView = {
      search: '',
      selection: {},
      sort: { column: 'name', direction: 'ascending' },
    };
    jest.clearAllMocks();
  });

  afterEach(() => layout.restore());

  it('lists every cluster by name with the default columns', async () => {
    await renderInTestApp(panel());
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

  it('links each name to its cluster’s page', async () => {
    await renderInTestApp(panel());
    const table = screen.getByRole('grid');
    expect(
      within(table).getByRole('link', { name: 'alder-birch' }),
    ).toHaveAttribute('href', '/platform/clusters/fennel/org-fern/alder-birch');
    expect(within(table).getByRole('link', { name: 'meadow' })).toHaveAttribute(
      'href',
      '/platform/clusters/meadow/org-giantswarm/meadow',
    );
  });

  it('is one tab stop per row: the name is the row’s only link', async () => {
    await renderInTestApp(panel());
    const table = screen.getByRole('grid');
    expect(within(table).getAllByRole('link')).toHaveLength(clusters.length);
    for (const row of within(table).getAllByRole('row').slice(1)) {
      expect(row).not.toHaveAttribute('href');
      expect(row).not.toHaveAttribute('data-href');
    }
  });

  it('opens a row’s cluster on a click beside its name, for the mouse', async () => {
    function Path() {
      return <output aria-label="path">{useLocation().pathname}</output>;
    }
    await renderInTestApp(
      <>
        {panel()}
        <Path />
      </>,
    );
    await userEvent.click(
      within(screen.getByRole('grid')).getByText('Creating'),
    );
    expect(screen.getByRole('status', { name: 'path' })).toHaveTextContent(
      '/platform/clusters/meadow/org-fern/cedar-elm',
    );
  });

  it('starts reading the clusters as it mounts', async () => {
    await renderInTestApp(panel());
    expect(mockStart).toHaveBeenCalled();
  });

  it('shows the list as it was left: its search, and paged to the cluster opened', async () => {
    mockData = Array.from({ length: 45 }, (_, index) =>
      cluster(`alder-${String(index).padStart(2, '0')}`),
    );
    const opened = mockData[33];
    mockInitialView = {
      ...mockInitialView,
      search: 'alder',
      opened: getClusterKey(opened),
    };
    await renderInTestApp(panel());
    expect(
      screen.getByRole('searchbox', { name: 'Search clusters' }),
    ).toHaveValue('alder');
    expect(screen.getByRole('link', { name: opened.name })).toBeInTheDocument();
  });

  it('draws no link without the Platform section’s links', async () => {
    await renderInTestApp(panel({ links: false }));
    const table = screen.getByRole('grid');
    expect(within(table).queryAllByRole('link')).toHaveLength(0);
  });

  it('marks a Kubernetes version past its end of life from the version a control plane reports', async () => {
    await renderInTestApp(panel());
    const row = screen.getByRole('row', { name: /cedar-elm/ });
    expect(within(row).getByText('Creating')).toBeInTheDocument();
    expect(within(row).getByText('30.1.2')).toBeInTheDocument();
    expect(within(row).getByText('1.30')).toBeInTheDocument();
    expect(within(row).getByText('EOL')).toBeInTheDocument();
    const other = screen.getByRole('row', { name: /alder-birch/ });
    expect(within(other).queryByText('EOL')).not.toBeInTheDocument();
  });

  it('sorts by a header and reverses on a second press', async () => {
    await renderInTestApp(panel());
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
    await renderInTestApp(panel());
    expect(
      screen.getByRole('searchbox', { name: 'Search clusters' }),
    ).toBeInTheDocument();
    for (const field of ['environment', 'organization', 'status']) {
      expect(
        screen.getByRole('button', { name: new RegExp(`Filter by ${field}`) }),
      ).toBeInTheDocument();
    }
  });

  it('searches by the start of words, as the shell’s other lists do', async () => {
    await renderInTestApp(panel());
    const search = screen.getByRole('searchbox', { name: 'Search clusters' });
    await userEvent.type(search, 'bir');
    expect(names()).toEqual([expect.stringContaining('alder-birch')]);
    await userEvent.clear(search);
    await userEvent.type(search, 'irch');
    expect(screen.getByText('No clusters match “irch”.')).toBeInTheDocument();
  });

  it('shows the columns a person chose and saves a change from the picker', async () => {
    mockVisible = ['status', 'region'];
    await renderInTestApp(panel());
    expect(headers()).toEqual(['Name', 'Status', 'Region']);

    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    const picker = await screen.findByRole('group', { name: 'Columns' });
    expect(
      within(picker).getByRole('checkbox', { name: 'Name' }),
    ).toBeDisabled();
    expect(
      within(picker).getByRole('checkbox', { name: 'Name' }),
    ).toBeChecked();
    await userEvent.click(
      within(picker).getByRole('checkbox', { name: 'Provider' }),
    );
    expect(mockSetVisible).toHaveBeenLastCalledWith(
      expect.arrayContaining(['status', 'region', 'provider']),
    );
    expect(mockSetVisible.mock.calls[0][0]).not.toContain('name');
  });

  it('closes the picker on Escape and keeps the columns chosen', async () => {
    mockVisible = ['status', 'region'];
    await renderInTestApp(panel());
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await screen.findByRole('group', { name: 'Columns' });
    await userEvent.keyboard('{Escape}');
    expect(
      screen.queryByRole('group', { name: 'Columns' }),
    ).not.toBeInTheDocument();
    expect(mockSetVisible).not.toHaveBeenCalled();
  });

  it('says why a value is missing where its read failed on the environment', async () => {
    mockVisible = ['release', 'region'];
    mockData = [
      cluster('alder-birch', { kubernetesVersion: undefined }),
      cluster('cedar-elm', {
        installationName: 'fennel',
        location: 'eu-west-1',
      }),
    ];
    mockRelated = {
      meadow: {
        controlPlanes: 'Access forbidden',
        providerClusters: 'API unreachable (timeout)',
      },
    };
    await renderInTestApp(panel());
    const row = screen.getByRole('row', { name: /alder-birch/ });
    expect(
      within(row).getByLabelText(
        'Could not read the Kubernetes version: Access forbidden.',
      ),
    ).toHaveTextContent('—');
    expect(
      within(row).getByLabelText(
        'Could not read the region: API unreachable (timeout).',
      ),
    ).toHaveTextContent('—');
    const other = screen.getByRole('row', { name: /cedar-elm/ });
    expect(within(other).getByText('eu-west-1')).toBeInTheDocument();
  });

  it('reads while the list has no answer', async () => {
    mockData = [];
    mockStatus = 'loading';
    await renderInTestApp(panel());
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.queryByText('No clusters yet')).not.toBeInTheDocument();
  });

  it('says when there are no clusters', async () => {
    mockData = [];
    mockStatus = 'empty';
    await renderInTestApp(panel());
    expect(screen.getByText('No clusters yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Columns' }),
    ).not.toBeInTheDocument();
  });

  it('shows an error with Try again, not an empty list, when no environment could be read', async () => {
    mockData = [];
    mockStatus = 'failed';
    mockUnlisted = [
      { installation: 'meadow', reason: 'the sign-in was declined' },
    ];
    await renderInTestApp(panel());
    expect(screen.queryByText('No clusters yet')).not.toBeInTheDocument();
    expect(
      screen.getByText('Could not read your clusters'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The clusters could not be read on meadow (the sign-in was declined).',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRetry).toHaveBeenCalled();
  });

  it('shows an error with Try again when the environments could not be listed', async () => {
    mockData = [];
    mockStatus = 'installations-failed';
    await renderInTestApp(panel());
    expect(screen.queryByText('No clusters yet')).not.toBeInTheDocument();
    expect(
      screen.getByText('Could not read your environments'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRetryInstallations).toHaveBeenCalled();
  });

  it('says the session ended instead of claiming there are no clusters', async () => {
    mockData = [];
    mockStatus = 'session-ended';
    await renderInTestApp(panel());
    expect(screen.queryByText('No clusters yet')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Your session in this browser ended. Sign in again to see them.',
      ),
    ).toBeInTheDocument();
  });

  it('names the environments that could not be read once every one answered, with Try again and a sign-in where it expired', async () => {
    mockUnlisted = [
      { installation: 'fennel', reason: 'API unreachable (timeout)' },
      { installation: 'tarragon', reason: 'Access forbidden' },
    ];
    mockAccess = [{ installation: 'tarragon', state: 'session-expired' }];
    await renderInTestApp(panel());
    expect(
      screen.getByText('Could not read 2 environments'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRetry).toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in again' }),
    );
    expect(mockSignInAgain).toHaveBeenCalled();
  });

  it('waits for the other environments before warning about one', async () => {
    mockUnlisted = [
      { installation: 'fennel', reason: 'API unreachable (timeout)' },
    ];
    mockReading = true;
    await renderInTestApp(panel());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stacks the clusters at phone width, without the column picker', async () => {
    layout.restore();
    layout = mockPhoneLayout();
    await renderInTestApp(panel());
    const list = screen.getByRole('list', { name: 'Clusters' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[1].textContent).toContain('cedar-elm');
    expect(items[1].textContent).toContain('Creating');
    expect(items[1].textContent).toMatch(/meadow.*fern.*30\.1\.2/);
    expect(
      within(items[1]).getByRole('link', { name: /cedar-elm/ }),
    ).toHaveAttribute('href', '/platform/clusters/meadow/org-fern/cedar-elm');
    expect(
      screen.queryByRole('button', { name: 'Columns' }),
    ).not.toBeInTheDocument();
  });
});
