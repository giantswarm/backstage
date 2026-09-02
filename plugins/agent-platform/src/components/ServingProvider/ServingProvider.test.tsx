import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ServedModel, ServingSourceSnapshot } from '../../lib/serving';
import { ServingProvider, useServing } from './ServingProvider';

const mockUseKServeServingSource = jest.fn<ServingSourceSnapshot, [string[]]>();
let mockReachable = { installations: ['alpha', 'beta'], isProbing: false };

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }],
    isLoading: false,
  }),
}));

jest.mock('../../hooks/useReachableInstallations', () => ({
  useReachableInstallations: () => mockReachable,
}));

jest.mock('./useKServeServingSource', () => ({
  useKServeServingSource: (...args: [string[]]) =>
    mockUseKServeServingSource(...args),
}));

const qwen: ServedModel = {
  id: 'alpha/kserve/kserve/qwen3-14b',
  installation: 'alpha',
  backend: 'kserve',
  name: 'qwen3-14b',
  namespace: 'kserve',
  readiness: 'ready',
  endpointHosts: ['qwen3-14b-predictor.kserve.svc.cluster.local'],
};

const snapshot: ServingSourceSnapshot = {
  isLoading: false,
  installations: ['alpha'],
  backends: { alpha: 'kserve' },
  unreachableInstallations: [],
  servedModels: [qwen],
  gpuNodes: [],
  gpuCapacityUnavailable: {},
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <ServingProvider>{children}</ServingProvider>
);

describe('ServingProvider', () => {
  beforeEach(() => {
    mockUseKServeServingSource.mockReset();
    mockUseKServeServingSource.mockReturnValue(snapshot);
    mockReachable = { installations: ['alpha', 'beta'], isProbing: false };
  });

  it('feeds the sources only the reachable installations', () => {
    renderHook(() => useServing(), { wrapper });

    expect(mockUseKServeServingSource).toHaveBeenCalledWith(['alpha', 'beta']);
  });

  it('exposes the merged snapshot', () => {
    const { result } = renderHook(() => useServing(), { wrapper });

    expect(result.current.installations).toEqual(['alpha']);
    expect(result.current.backends).toEqual({ alpha: 'kserve' });
    expect(result.current.servedModels).toEqual([qwen]);
  });

  it('resolves a ModelConfig endpoint to the served model on the same installation only', () => {
    const { result } = renderHook(() => useServing(), { wrapper });

    expect(
      result.current.servedModelForEndpoint(
        'alpha',
        'http://qwen3-14b-predictor.kserve.svc.cluster.local/v1',
      ),
    ).toBe(qwen);
    expect(
      result.current.servedModelForEndpoint(
        'beta',
        'http://qwen3-14b-predictor.kserve.svc.cluster.local/v1',
      ),
    ).toBeUndefined();
    expect(
      result.current.servedModelForEndpoint('alpha', undefined),
    ).toBeUndefined();
  });

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useServing())).toThrow(
      'useServing must be used within a ServingProvider',
    );
  });
});
