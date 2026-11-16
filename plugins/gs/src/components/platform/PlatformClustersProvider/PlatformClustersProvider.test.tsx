import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import type { UnlistedInstallation } from '../../clusters/ClustersDataProvider';
import {
  PlatformClustersProvider,
  usePlatformClustersCount,
  usePlatformClustersState,
} from './PlatformClustersProvider';

let mockClustersInfo: {
  clusters: string[];
  isLoading: boolean;
  error: Error | null;
};
let mockDisabled: { disabledInstallations: string[]; isLoading: boolean };
let mockMuted: string[];
let mockSessionEnd: string | undefined;
let mockData: { name: string }[];
let mockReading: boolean;
let mockAnswered: string[];
let mockUnlisted: UnlistedInstallation[];
let mockSaved: string[];
const providerProps: { installations?: string[]; columns?: string[] }[] = [];

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  ErrorsProvider: ({ children }: { children: ReactNode }) => children,
  useClustersInfo: () => ({ ...mockClustersInfo, retry: jest.fn() }),
}));
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useTableColumns: () => ({
    visibleColumns: mockSaved,
    saveVisibleColumns: jest.fn(),
  }),
}));
jest.mock('../../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../../hooks/useDisabledInstallations', () => ({
  useDisabledInstallations: () => mockDisabled,
}));
jest.mock('../../../apis/mutedInstallations', () => ({
  useMutedInstallations: () => mockMuted,
}));
jest.mock('../../../apis/auth/mainSessionEnd', () => ({
  useMainSessionEnd: () => mockSessionEnd,
}));
jest.mock('../../clusters/ClustersDataProvider', () => ({
  ClustersDataProvider: (props: {
    installations?: string[];
    columns?: string[];
    children: ReactNode;
  }) => {
    providerProps.push({
      installations: props.installations,
      columns: props.columns,
    });
    return props.children;
  },
  useClustersData: () => ({
    data: mockData,
    isReadingClusters: mockReading,
    answeredInstallations: mockAnswered,
    unlistedInstallations: mockUnlisted,
  }),
}));

function Probe() {
  const { status, visibleColumns } = usePlatformClustersState();
  const count = usePlatformClustersCount();
  return <p>{`${status} · ${String(count)} · ${visibleColumns.join(',')}`}</p>;
}

function renderProvider() {
  return render(
    <PlatformClustersProvider>
      <Probe />
    </PlatformClustersProvider>,
  );
}

describe('PlatformClustersProvider', () => {
  beforeEach(() => {
    mockClustersInfo = {
      clusters: ['meadow', 'fennel', 'tarragon'],
      isLoading: false,
      error: null,
    };
    mockDisabled = { disabledInstallations: [], isLoading: false };
    mockMuted = [];
    mockSessionEnd = undefined;
    mockData = [];
    mockReading = false;
    mockAnswered = [];
    mockUnlisted = [];
    mockSaved = [];
    providerProps.length = 0;
  });

  it('hands the installations to read to the data provider from its first render, without the disabled and switched-off ones', () => {
    mockDisabled = { disabledInstallations: ['fennel'], isLoading: false };
    mockMuted = ['tarragon'];
    renderProvider();
    expect(providerProps[0].installations).toEqual(['meadow']);
  });

  it('is loading, never empty, before the installations have been read', () => {
    // The first commit after the installations resolve: nothing read yet,
    // nothing reading yet.
    renderProvider();
    expect(screen.getByText(/^loading · loading/)).toBeInTheDocument();
  });

  it('is loading while the installations are being worked out', () => {
    mockClustersInfo.isLoading = true;
    renderProvider();
    expect(screen.getByText(/^loading · loading/)).toBeInTheDocument();
    expect(providerProps[0].installations).toEqual([]);
  });

  it('is empty only once an environment answered and none failed', () => {
    mockAnswered = ['meadow', 'fennel', 'tarragon'];
    renderProvider();
    expect(screen.getByText(/^empty · 0/)).toBeInTheDocument();
  });

  it('has failed, without a count, when an environment could not be read and there is no cluster', () => {
    mockAnswered = ['meadow'];
    mockUnlisted = [
      { installation: 'fennel', reason: 'the sign-in was declined' },
    ];
    renderProvider();
    expect(screen.getByText(/^failed · undefined/)).toBeInTheDocument();
  });

  it('has failed when every environment’s sign-in was declined', () => {
    mockUnlisted = ['meadow', 'fennel', 'tarragon'].map(installation => ({
      installation,
      reason: 'the sign-in was declined',
    }));
    renderProvider();
    expect(screen.getByText(/^failed/)).toBeInTheDocument();
  });

  it('says the installation list failed rather than that there are none', () => {
    mockClustersInfo = {
      clusters: [],
      isLoading: false,
      error: new Error('500'),
    };
    renderProvider();
    expect(
      screen.getByText(/^installations-failed · undefined/),
    ).toBeInTheDocument();
  });

  it('says the session ended rather than that there are no clusters', () => {
    mockSessionEnd = 'expired';
    mockAnswered = ['meadow'];
    renderProvider();
    expect(screen.getByText(/^session-ended · undefined/)).toBeInTheDocument();
  });

  it('counts the clusters once there are some, failures elsewhere or not', () => {
    mockData = [{ name: 'a' }, { name: 'b' }];
    mockUnlisted = [{ installation: 'fennel', reason: 'Access forbidden' }];
    renderProvider();
    expect(screen.getByText(/^ready · 2/)).toBeInTheDocument();
  });

  it('reads only what the shown columns need', () => {
    mockSaved = ['name', 'status', 'region'];
    renderProvider();
    expect(screen.getByText(/· status,region$/)).toBeInTheDocument();
    expect(providerProps[0].columns).toEqual(['location']);
  });
});
