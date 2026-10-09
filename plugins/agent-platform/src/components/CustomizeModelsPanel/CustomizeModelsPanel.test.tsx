import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { AgentRow } from '../AgentsDataProvider';
import type { ModelRow } from '../ModelsTable';
import { modelsRouteRef } from '../../routes';
import { CustomizeModelsPanel } from './CustomizeModelsPanel';

const sonnet: ModelRow = {
  id: 'golem/support/sonnet',
  installation: 'golem',
  name: 'sonnet',
  namespace: 'support',
  displayName: 'Sonnet 4.5',
  provider: 'Anthropic',
  model: 'claude-sonnet-4-5',
  endpoint: '',
  readiness: 'accepted',
};
const qwen: ModelRow = {
  ...sonnet,
  id: 'golem/engineering/qwen',
  name: 'qwen',
  namespace: 'engineering',
  displayName: 'Qwen 2.5',
  provider: 'Ollama',
  model: 'qwen2.5:32b',
  servedBy: {
    installation: 'golem',
    backend: 'ollama',
    readiness: 'notServing',
    name: 'qwen2.5:32b',
    message: 'gone',
  },
};

let mockModelRows: ModelRow[];
let mockModelsLoading = false;
let mockServingInstallations: string[] = [];
const agents = [
  { id: 'a', modelConfigId: 'golem/support/sonnet' },
  { id: 'b', modelConfigId: 'golem/support/sonnet' },
] as AgentRow[];

jest.mock('../CustomizeDataProvider', () => ({
  useCustomizeData: () => ({ modelRows: mockModelRows }),
}));
jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => ({
    isLoading: mockModelsLoading,
    hasInstallations: true,
    unreachableInstallations: [],
  }),
}));
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => ({ rows: agents, isLoading: false }),
}));
jest.mock('../ServingProvider', () => ({
  hasServingLayer: (serving: { installations: string[] }) =>
    serving.installations.length > 0,
  useServing: () => ({
    installations: mockServingInstallations,
    unreachableInstallations: [],
  }),
}));

function renderPanel(search = '', organization = 'all') {
  return renderInTestApp(
    <CustomizeModelsPanel search={search} organization={organization} />,
    { mountedRoutes: { '/agent-platform/models': modelsRouteRef } },
  );
}

describe('CustomizeModelsPanel', () => {
  beforeEach(() => {
    mockModelRows = [sonnet, qwen];
    mockModelsLoading = false;
    mockServingInstallations = [];
  });

  it('lists the models with their usage and state', async () => {
    await renderPanel();

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringMatching(
        /Sonnet 4\.5.*Anthropic.*Used by 2 agents.*Available/,
      ),
      expect.stringMatching(/Qwen 2\.5.*Ollama.*Not used yet.*Not running/),
    ]);
  });

  it('narrows to the organization and the search', async () => {
    await renderPanel('', 'engineering');
    expect(screen.queryByText('Sonnet 4.5')).not.toBeInTheDocument();
  });

  it('offers model hosting only where a serving layer runs', async () => {
    const { unmount } = await renderPanel();
    expect(
      screen.queryByRole('link', { name: 'Model hosting' }),
    ).not.toBeInTheDocument();
    unmount();

    mockServingInstallations = ['golem'];
    await renderPanel();
    expect(screen.getByRole('link', { name: 'Model hosting' })).toHaveAttribute(
      'href',
      '/agent-platform/models/serving',
    );
  });

  it('shows the empty state once nothing is found', async () => {
    mockModelRows = [];
    await renderPanel();
    expect(screen.getByText('No models yet')).toBeInTheDocument();
  });
});
