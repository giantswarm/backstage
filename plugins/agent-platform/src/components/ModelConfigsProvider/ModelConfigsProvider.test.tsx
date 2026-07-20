import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ModelConfigsProvider, useModelConfigs } from './ModelConfigsProvider';

// Mock the fleet-query plumbing so the test drives the reachable→with-models
// narrowing directly. The `mock`-prefixed names are the only out-of-scope
// references jest allows inside a mock factory.
const mockUseResources = jest.fn();
let mockConfigInstallations: string[] = ['alpha', 'beta', 'gaggle'];
let mockReachable: { installations: string[]; isProbing: boolean } = {
  installations: ['alpha', 'beta', 'gaggle'],
  isProbing: false,
};

jest.mock('@backstage/core-plugin-api', () => ({
  configApiRef: {},
  useApi: () => ({
    getOptionalConfig: () => ({ keys: () => mockConfigInstallations }),
  }),
}));

jest.mock('../../hooks/useReachableInstallations', () => ({
  useReachableInstallations: () => mockReachable,
}));

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ModelConfig: class {},
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

// Duck-typed stand-in for a ModelConfig instance — the provider only reads
// `.cluster`.
function fakeModelConfig(cluster: string) {
  return { cluster };
}

/**
 * Build a `useResources` return value. `succeeded` maps each installation to how
 * many ModelConfigs it returned; `failed` lists installations whose read errored
 * (403/unreachable); `notFound` lists installations that 404'd (kagent not
 * installed).
 */
function result({
  succeeded = {},
  failed = [],
  notFound = [],
  isLoading = false,
}: {
  succeeded?: Record<string, number>;
  failed?: string[];
  notFound?: string[];
  isLoading?: boolean;
}) {
  const resources = Object.entries(succeeded).flatMap(([cluster, count]) =>
    Array.from({ length: count }, () => fakeModelConfig(cluster)),
  );
  const errors = [
    ...failed.map(cluster => ({ cluster, error: { name: 'ForbiddenError' } })),
    ...notFound.map(cluster => ({
      cluster,
      error: { name: 'NotFoundError' },
    })),
  ];
  return { resources, isLoading, errors };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ModelConfigsProvider>{children}</ModelConfigsProvider>
);

const renderUseModelConfigs = () =>
  renderHook(() => useModelConfigs(), { wrapper });

describe('ModelConfigsProvider', () => {
  beforeEach(() => {
    mockUseResources.mockReset();
    mockConfigInstallations = ['alpha', 'beta', 'gaggle'];
    mockReachable = {
      installations: ['alpha', 'beta', 'gaggle'],
      isProbing: false,
    };
  });

  it('only queries the reachable installations', () => {
    mockReachable = { installations: ['alpha', 'beta'], isProbing: false };
    mockUseResources.mockReturnValue(result({}));

    renderUseModelConfigs();

    // First positional arg to useResources is the installation list.
    expect(mockUseResources.mock.calls[0][0]).toEqual(['alpha', 'beta']);
  });

  it('offers only reachable installations that returned a model', () => {
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: 2, beta: 0 } }),
    );

    const { result: hook } = renderUseModelConfigs();

    // beta is reachable but returned no ModelConfig; gaggle returned nothing.
    expect(hook.current.availableInstallations).toEqual(['alpha']);
    expect(hook.current.modelConfigsFor('alpha')).toHaveLength(2);
    expect(hook.current.modelConfigsFor('beta')).toHaveLength(0);
  });

  it('does not flag a 404 (kagent not installed) as unreachable', () => {
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: 1 }, notFound: ['grizzly'] }),
    );

    const { result: hook } = renderUseModelConfigs();

    expect(hook.current.unreachableInstallations).toEqual([]);
    expect(hook.current.availableInstallations).toEqual(['alpha']);
  });

  it('surfaces installations that errored and produced no models', () => {
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: 1 }, failed: ['gaggle'] }),
    );

    const { result: hook } = renderUseModelConfigs();

    expect(hook.current.unreachableInstallations).toEqual(['gaggle']);
    expect(hook.current.availableInstallations).toEqual(['alpha']);
  });

  it('reports loading while probes are still settling', () => {
    mockReachable = { installations: [], isProbing: true };
    mockUseResources.mockReturnValue(result({ isLoading: false }));

    const { result: hook } = renderUseModelConfigs();

    expect(hook.current.isLoading).toBe(true);
  });

  it('reports hasInstallations from the configured set', () => {
    mockConfigInstallations = [];
    mockReachable = { installations: [], isProbing: false };
    mockUseResources.mockReturnValue(result({}));

    const { result: hook } = renderUseModelConfigs();

    expect(hook.current.hasInstallations).toBe(false);
  });
});
