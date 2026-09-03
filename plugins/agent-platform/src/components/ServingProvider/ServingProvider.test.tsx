import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ServedModel, ServingSourceSnapshot } from '../../lib/serving';
import { ServingProvider, useServing } from './ServingProvider';

const mockUseKServeServingSource = jest.fn<ServingSourceSnapshot, [string[]]>();
const mockUseModelManagerServingSource = jest.fn<
  ServingSourceSnapshot,
  [string[]]
>();
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

jest.mock('./useModelManagerServingSource', () => ({
  useModelManagerServingSource: (...args: [string[]]) =>
    mockUseModelManagerServingSource(...args),
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

const empty: ServingSourceSnapshot = {
  isLoading: false,
  installations: [],
  backends: {},
  unreachableInstallations: [],
  servedModels: [],
  gpuNodes: [],
  gpuCapacityUnavailable: {},
};

const smollm: ServedModel = {
  id: 'alpha/ollama//smollm2:135m',
  installation: 'alpha',
  backend: 'ollama',
  name: 'smollm2:135m',
  readiness: 'available',
  endpointHosts: ['172.21.0.1:11434'],
  modelConfig: { name: 'smollm2-135m', namespace: 'kagent' },
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <ServingProvider>{children}</ServingProvider>
);

describe('ServingProvider', () => {
  beforeEach(() => {
    mockUseKServeServingSource.mockReset();
    mockUseKServeServingSource.mockReturnValue(snapshot);
    mockUseModelManagerServingSource.mockReset();
    mockUseModelManagerServingSource.mockReturnValue(empty);
    mockReachable = { installations: ['alpha', 'beta'], isProbing: false };
  });

  it('feeds the sources only the reachable installations', () => {
    renderHook(() => useServing(), { wrapper });

    expect(mockUseKServeServingSource).toHaveBeenCalledWith(['alpha', 'beta']);
    expect(mockUseModelManagerServingSource).toHaveBeenCalledWith([
      'alpha',
      'beta',
    ]);
  });

  it('lists both sources side by side on one installation, the later deciding its backend', () => {
    // A lab with KServe CRDs and an Ollama-backed model-manager: the
    // InferenceService and the Ollama model both render; the installation is
    // labelled by the model-manager source; capabilities are OR-ed.
    mockUseModelManagerServingSource.mockReturnValue({
      ...empty,
      installations: ['alpha'],
      backends: { alpha: 'ollama' },
      capabilities: {
        alpha: {
          pull: true,
          pullProgress: true,
          delete: true,
          load: true,
          unload: true,
          loadedModels: true,
          wire: true,
          presets: false,
          fitCheck: false,
          nodeInventory: false,
          search: false,
        },
      },
      servedModels: [smollm],
    });
    mockUseKServeServingSource.mockReturnValue({
      ...snapshot,
      capabilities: {
        alpha: {
          pull: false,
          pullProgress: false,
          delete: false,
          load: false,
          unload: false,
          loadedModels: false,
          wire: false,
          presets: false,
          fitCheck: false,
          nodeInventory: true,
          search: false,
        },
      },
    });

    const { result } = renderHook(() => useServing(), { wrapper });

    expect(result.current.installations).toEqual(['alpha']);
    expect(result.current.backends).toEqual({ alpha: 'ollama' });
    expect(result.current.servedModels).toEqual([qwen, smollm]);
    expect(result.current.capabilities?.alpha).toMatchObject({
      pull: true,
      nodeInventory: true,
    });
    // The exact ModelConfig reference wins over hostname matching.
    expect(
      result.current.servedModelFor('alpha', {
        endpoint: 'http://172.21.0.1:11434',
        model: 'other:1b',
        modelConfig: { name: 'smollm2-135m', namespace: 'kagent' },
      }),
    ).toBe(smollm);
  });

  it('applies the installation’s declared multi-model hosts to the served-model link', () => {
    // One Ollama model listed on a host the source declared shared: a client
    // of that host asking for another tag fronts nothing; a client of another
    // port on the machine is not Ollama's at all.
    mockUseModelManagerServingSource.mockReturnValue({
      ...empty,
      installations: ['alpha'],
      backends: { alpha: 'ollama' },
      sharedHosts: { alpha: ['172.21.0.1:11434'] },
      servedModels: [smollm],
    });
    const { result } = renderHook(() => useServing(), { wrapper });

    expect(
      result.current.servedModelFor('alpha', {
        endpoint: 'http://172.21.0.1:11434',
        model: 'smollm2:135m',
      }),
    ).toBe(smollm);
    expect(
      result.current.servedModelFor('alpha', {
        endpoint: 'http://172.21.0.1:11434',
        model: 'gemma3:270m',
      }),
    ).toBeUndefined();
    expect(
      result.current.servedModelFor('alpha', {
        endpoint: 'http://172.21.0.1:13305/v1',
        model: 'qwen3-it-4b-FLM',
      }),
    ).toBeUndefined();
    expect(
      result.current.servingStateFor('alpha', {
        endpoint: 'http://172.21.0.1:11434',
        model: 'gemma3:270m',
      }),
    ).toMatchObject({ readiness: 'notServing', name: 'gemma3:270m' });
    expect(
      result.current.servingStateFor('alpha', {
        endpoint: 'http://172.21.0.1:13305/v1',
        model: 'qwen3-it-4b-FLM',
      }),
    ).toBeUndefined();
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
