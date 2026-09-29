import { render, screen } from '@testing-library/react';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import type { ServedModel } from '../../lib/serving';
import type { ServingContextValue } from '../ServingProvider';
import type { ModelConfigsContextValue } from '../ModelConfigsProvider';
import {
  ServedModelRowsProvider,
  useServedModelRows,
} from './ServedModelRowsProvider';

const mockUseServing = jest.fn<Partial<ServingContextValue>, []>();
const mockUseModelConfigs = jest.fn<Partial<ModelConfigsContextValue>, []>();

jest.mock('../ServingProvider', () => ({
  useServing: () => mockUseServing(),
}));
jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => mockUseModelConfigs(),
}));

const ROUTE = 'https://models.example.test/kserve/qwen3-14b';

const qwen: ServedModel = {
  id: 'inst-1/kserve/kserve/qwen3-14b',
  installation: 'inst-1',
  backend: 'kserve',
  name: 'qwen3-14b',
  namespace: 'kserve',
  modelSource: 'Qwen/Qwen3-14B',
  readiness: 'ready',
  internalUrl: ROUTE,
  endpointHosts: ['models.example.test'],
};

// A model whose backend already knows its ModelConfig (model-manager wired it).
const smollm: ServedModel = {
  id: 'inst-1/ollama//smollm2:135m',
  installation: 'inst-1',
  backend: 'ollama',
  name: 'smollm2:135m',
  modelSource: 'smollm2:135m',
  readiness: 'available',
  endpointHosts: ['172.21.0.1:11434'],
  modelConfig: { namespace: 'kagent', name: 'smollm2' },
};

function modelConfig(name: string, baseUrl?: string) {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha3',
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
        </li>
      ))}
    </ul>
  );
};

describe('ServedModelRowsProvider', () => {
  beforeEach(() => {
    mockUseServing.mockReset();
    mockUseModelConfigs.mockReset();
    mockUseServing.mockReturnValue({
      installations: ['inst-1'],
      servedModels: [qwen, smollm],
      servedModelFor: (_installation, lookup) =>
        lookup.endpoint?.includes('/kserve/qwen3-14b') ? qwen : undefined,
    });
    mockUseModelConfigs.mockReturnValue({
      isLoading: false,
      modelConfigsFor: () => [
        modelConfig('qwen3-14b', `${ROUTE}/v1`),
        modelConfig('claude'),
      ],
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

  it('lists a model nobody points at as used by nobody', () => {
    mockUseModelConfigs.mockReturnValue({
      isLoading: false,
      modelConfigsFor: () => [],
    });

    render(
      <ServedModelRowsProvider>
        <Rows />
      </ServedModelRowsProvider>,
    );

    expect(
      screen.getByText('inst-1/kserve/kserve/qwen3-14b: used by nobody'),
    ).toBeInTheDocument();
    // The backend's own ModelConfig still counts.
    expect(
      screen.getByText('inst-1/ollama//smollm2:135m: used by smollm2'),
    ).toBeInTheDocument();
  });

  it('refuses to be read outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Rows />)).toThrow(
      'useServedModelRows must be used within a ServedModelRowsProvider',
    );
  });
});
