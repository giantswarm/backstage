import { render, screen } from '@testing-library/react';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import type { ServedModel } from '../../lib/serving';
import type { WiringState } from '../../hooks/useAutoWireServedModels';
import type { ServingContextValue } from '../ServingProvider';
import type { ModelConfigsContextValue } from '../ModelConfigsProvider';
import {
  ServedModelRowsProvider,
  useServedModelRows,
} from './ServedModelRowsProvider';

const mockUseServing = jest.fn<Partial<ServingContextValue>, []>();
const mockUseModelConfigs = jest.fn<Partial<ModelConfigsContextValue>, []>();
const mockUseAutoWireServedModels = jest.fn();

jest.mock('../ServingProvider', () => ({
  useServing: () => mockUseServing(),
}));
jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => mockUseModelConfigs(),
}));
jest.mock('../../hooks/useAutoWireServedModels', () => ({
  useAutoWireServedModels: (...args: unknown[]) =>
    mockUseAutoWireServedModels(...args),
}));

const qwen: ServedModel = {
  id: 'inst-1/kserve/kserve/qwen3-14b',
  installation: 'inst-1',
  backend: 'kserve',
  name: 'qwen3-14b',
  namespace: 'kserve',
  modelSource: 'hf://Qwen/Qwen3-14B',
  runtime: 'kserve-vllm',
  readiness: 'ready',
  internalUrl: 'http://qwen3-14b-predictor.kserve.svc.cluster.local',
  endpointHosts: ['qwen3-14b-predictor.kserve.svc.cluster.local'],
};

// A model whose backend already knows its ModelConfig (model-manager wired it).
const smollm: ServedModel = {
  id: 'inst-1/ollama//smollm2:135m',
  installation: 'inst-1',
  backend: 'ollama',
  name: 'smollm2:135m',
  modelSource: 'smollm2:135m',
  readiness: 'available',
  endpointHosts: ['172.21.0.1'],
  modelConfig: { namespace: 'kagent', name: 'smollm2' },
};

function modelConfig(name: string, baseUrl?: string) {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'ModelConfig',
      metadata: { name, namespace: 'kagent' },
      spec: {
        provider: 'OpenAI',
        model: name,
        ...(baseUrl ? { openAI: { baseUrl } } : {}),
      },
    } as any,
    'inst-1',
  );
}

const Rows = () => {
  const { rows } = useServedModelRows();
  return (
    <ul>
      {rows.map(row => (
        <li key={row.id}>
          {row.id}: used by{' '}
          {row.usedBy.map(consumer => consumer.name).join(',') || 'nobody'}
          {row.wiring ? ` (${row.wiring.status})` : ''}
        </li>
      ))}
    </ul>
  );
};

describe('ServedModelRowsProvider', () => {
  beforeEach(() => {
    mockUseServing.mockReset();
    mockUseModelConfigs.mockReset();
    mockUseAutoWireServedModels.mockReset();
    mockUseServing.mockReturnValue({
      installations: ['inst-1'],
      servedModels: [qwen, smollm],
      servedModelFor: (_installation, lookup) =>
        lookup.endpoint?.includes('qwen3-14b-predictor') ? qwen : undefined,
    });
    mockUseModelConfigs.mockReturnValue({
      isLoading: false,
      modelConfigsFor: () => [
        modelConfig(
          'qwen3-14b',
          'http://qwen3-14b-predictor.kserve.svc.cluster.local/v1',
        ),
        modelConfig('claude'),
      ],
    });
    mockUseAutoWireServedModels.mockReturnValue({
      wiringFor: () => undefined,
    });
  });

  it('joins each served model with the ModelConfigs pointing at it, and the one its backend knows', () => {
    render(
      <ServedModelRowsProvider>
        <Rows />
      </ServedModelRowsProvider>,
    );

    expect(
      screen.getByText('inst-1/kserve/kserve/qwen3-14b: used by qwen3-14b'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('inst-1/ollama//smollm2:135m: used by smollm2'),
    ).toBeInTheDocument();
  });

  it('hands the joined rows to the auto-wiring and reports its state per row', () => {
    const wiring: WiringState = { status: 'wiring' };
    mockUseAutoWireServedModels.mockReturnValue({
      wiringFor: (id: string) => (id === qwen.id ? wiring : undefined),
    });
    mockUseModelConfigs.mockReturnValue({
      isLoading: true,
      modelConfigsFor: () => [],
    });

    render(
      <ServedModelRowsProvider>
        <Rows />
      </ServedModelRowsProvider>,
    );

    const [candidates, , options] = mockUseAutoWireServedModels.mock.calls[0];
    expect(candidates.map((row: ServedModel) => row.id)).toEqual([
      qwen.id,
      smollm.id,
    ]);
    expect(options).toEqual({ modelConfigsLoading: true });
    expect(
      screen.getByText(
        'inst-1/kserve/kserve/qwen3-14b: used by nobody (wiring)',
      ),
    ).toBeInTheDocument();
  });

  it('refuses to be read outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Rows />)).toThrow(
      'useServedModelRows must be used within a ServedModelRowsProvider',
    );
  });
});
