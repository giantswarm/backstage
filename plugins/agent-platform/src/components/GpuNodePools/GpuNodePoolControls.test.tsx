import { renderHook } from '@testing-library/react';
import {
  NO_CLUSTER_REASON,
  useGpuNodePoolControls,
} from './GpuNodePoolControls';

let mockAvailability: { available: string[]; isLoading: boolean };
let mockPools: {
  rows: unknown[];
  caches: unknown[];
  notes: unknown[];
  clusterless: string[];
  errors: unknown[];
  isLoading: boolean;
};

jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRef: () => () => '/customize/models/hosting/capacity/add-pool',
  useApi: () => ({ post: jest.fn() }),
}));
jest.mock('../../hooks/useClusterManager', () => ({
  useClusterManagerAvailability: () => mockAvailability,
  useClusterManagerInfo: () => ({ info: undefined }),
  useGpuNodePools: () => mockPools,
  useInstallationsOffering: () => [],
  useNodePoolWrite: () => ({}),
}));
jest.mock('../../hooks/useHostingFlow', () => ({
  useHostingFlowOutcome: () => undefined,
  useOpenHostingFlow: () => jest.fn(),
}));
jest.mock('../../hooks/useNodeSizePrices', () => ({
  useNodeSizePrices: () => ({}),
}));
jest.mock('../../hooks/useServeIntentRunner', () => ({
  useServeIntentRunner: () => ({ isServing: () => false, retry: jest.fn() }),
}));
jest.mock('../../hooks/useServeIntents', () => ({
  useServeIntents: () => ({ intentOf: () => undefined, remove: jest.fn() }),
}));

const controls = () =>
  renderHook(() =>
    useGpuNodePoolControls(['lab'], [], { kind: 'all' } as never),
  ).result.current;

describe('useGpuNodePoolControls · Add GPU node pool', () => {
  beforeEach(() => {
    mockAvailability = { available: ['lab'], isLoading: false };
    mockPools = {
      rows: [],
      caches: [],
      notes: [],
      clusterless: [],
      errors: [],
      isLoading: false,
    };
  });

  it('opens the flow where an environment has a cluster', () => {
    expect(controls().addAction).toEqual({
      open: expect.any(Function),
      isDisabled: false,
    });
  });

  it('is disabled with the reason where no environment has a cluster', () => {
    mockPools.clusterless = ['lab'];
    expect(controls().addAction).toEqual({
      open: expect.any(Function),
      isDisabled: true,
      disabledReason: NO_CLUSTER_REASON,
    });
  });

  it('gives the benefit of the doubt while the clusters are read', () => {
    mockPools.clusterless = ['lab'];
    mockPools.isLoading = true;
    expect(controls().addAction?.disabledReason).toBeUndefined();
  });

  it('stays open where one of several environments has a cluster', () => {
    mockAvailability.available = ['lab', 'gazelle'];
    mockPools.clusterless = ['lab'];
    expect(controls().addAction?.isDisabled).toBe(false);
  });
});
