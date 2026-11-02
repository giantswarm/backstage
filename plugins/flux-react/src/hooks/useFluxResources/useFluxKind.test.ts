import { renderHook, waitFor } from '@testing-library/react';
import {
  FluxInstance,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxKind } from './useFluxResources';

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: jest.fn(),
}));

const mockUseResources = useResources as jest.Mock;

function notFoundOn(cluster: string) {
  const error = new Error('the server could not find the requested resource');
  error.name = 'NotFoundError';
  return { cluster, error, retry: () => {} };
}

describe('useFluxKind', () => {
  beforeEach(() => {
    mockUseResources.mockReset();
  });

  it('stops asking only the cluster that lacks the CRD', async () => {
    const withoutOperator = notFoundOn('without-operator');
    mockUseResources.mockImplementation((clusters: string[]) => ({
      resources: [],
      isLoading: false,
      errors: clusters.includes('without-operator') ? [withoutOperator] : [],
    }));

    const { result, rerender } = renderHook(
      ({ clusters }) => useFluxKind(clusters, FluxInstance, 15000),
      { initialProps: { clusters: ['without-operator', 'with-operator'] } },
    );

    await waitFor(() =>
      expect(mockUseResources).toHaveBeenLastCalledWith(
        ['with-operator'],
        FluxInstance,
        {},
        { refetchInterval: 15000, enabled: true },
      ),
    );
    expect(result.current.errors).toEqual([]);

    // Switching to another cluster still asks it.
    rerender({ clusters: ['another-with-operator'] });
    expect(mockUseResources).toHaveBeenLastCalledWith(
      ['another-with-operator'],
      FluxInstance,
      {},
      { refetchInterval: 15000, enabled: true },
    );
  });

  it('reports errors other than a missing CRD', () => {
    const forbidden = {
      cluster: 'a',
      error: Object.assign(new Error('forbidden'), { name: 'ForbiddenError' }),
      retry: () => {},
    };
    mockUseResources.mockReturnValue({
      resources: [],
      isLoading: false,
      errors: [forbidden],
    });

    const { result } = renderHook(() =>
      useFluxKind(['a'], FluxInstance, 15000),
    );

    expect(result.current.errors).toEqual([forbidden]);
  });

  it('asks nothing without a cluster', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      isLoading: false,
      errors: [],
    });

    renderHook(() => useFluxKind(null, FluxInstance, 15000));

    expect(mockUseResources).toHaveBeenLastCalledWith(
      [],
      FluxInstance,
      {},
      {
        refetchInterval: 15000,
        enabled: false,
      },
    );
  });
});
