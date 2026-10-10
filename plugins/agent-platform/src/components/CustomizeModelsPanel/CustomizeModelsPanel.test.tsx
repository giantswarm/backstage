import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function renderPanel(search = '') {
  return renderInTestApp(<CustomizeModelsPanel search={search} />, {
    mountedRoutes: { '/agent-platform/models': modelsRouteRef },
  });
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

  it('narrows to the search', async () => {
    await renderPanel('qwen');
    expect(screen.getByText('Qwen 2.5')).toBeInTheDocument();
    expect(screen.queryByText('Sonnet 4.5')).not.toBeInTheDocument();
  });

  it('offers model hosting only where a serving layer runs', async () => {
    const { unmount } = await renderPanel();
    expect(
      screen.queryByRole('link', { name: 'Model hosting' }),
    ).not.toBeInTheDocument();
    // Without one: the hint at what turns it on.
    expect(
      screen.getByRole('link', { name: 'How to turn it on' }),
    ).toBeInTheDocument();
    unmount();

    mockServingInstallations = ['golem'];
    await renderPanel();
    expect(screen.getByRole('link', { name: 'Model hosting' })).toHaveAttribute(
      'href',
      '/agent-platform/models/serving',
    );
    expect(
      screen.queryByRole('link', { name: 'How to turn it on' }),
    ).not.toBeInTheDocument();
  });

  describe('at list scale', () => {
    function manyModels(count: number): ModelRow[] {
      return Array.from({ length: count }, (_, i) => {
        const name = `model-${String(i).padStart(3, '0')}`;
        return {
          ...sonnet,
          id: `golem/support/${name}`,
          name,
          displayName: `Model ${String(i).padStart(3, '0')}`,
        };
      });
    }
    const bodyRows = () => screen.getAllByRole('row').slice(1);

    it('draws three models with no paging chrome', async () => {
      mockModelRows = manyModels(3);
      await renderPanel();

      expect(bodyRows()).toHaveLength(3);
      expect(
        screen.queryByRole('button', { name: /^Show \d+ more/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/shown/)).not.toBeInTheDocument();
      // bui's page-mode footer.
      expect(screen.queryByText(/of 3/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /next/i }),
      ).not.toBeInTheDocument();
    });

    it('draws the first 20 of 300 models and pages in the rest', async () => {
      mockModelRows = manyModels(300);
      await renderPanel();

      expect(bodyRows()).toHaveLength(20);
      expect(screen.getByText('20 models shown, 280 more')).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Show 20 more models' }),
      );

      expect(bodyRows()).toHaveLength(40);
      expect(
        screen.getByRole('button', { name: 'Show fewer' }),
      ).toBeInTheDocument();
    });

    it('pages a search of 300 models too', async () => {
      mockModelRows = manyModels(300);
      await renderPanel('model-1');

      // model-100 .. model-199
      expect(bodyRows()).toHaveLength(20);
      expect(screen.getByText('20 models shown, 80 more')).toBeInTheDocument();
    });
  });

  it('shows the empty state once nothing is found', async () => {
    mockModelRows = [];
    await renderPanel();
    expect(screen.getByText('No models yet')).toBeInTheDocument();
  });
});

describe('CustomizeModelsPanel provider filter (T49)', () => {
  const bodyRows = () => screen.getAllByRole('row').slice(1);
  const chips = () =>
    within(screen.getByRole('radiogroup', { name: 'Filter by provider' }))
      .getAllByRole('radio')
      .map(chip => chip.textContent);
  const model = (index: number, provider: string): ModelRow => ({
    ...sonnet,
    id: `golem/support/m-${index}`,
    name: `m-${index}`,
    displayName: `Model ${String(index).padStart(3, '0')}`,
    provider,
  });

  beforeEach(() => {
    mockModelsLoading = false;
    mockServingInstallations = [];
  });

  it('draws no filter over three models of one provider', async () => {
    mockModelRows = [0, 1, 2].map(index => model(index, 'Anthropic'));
    await renderPanel();

    expect(bodyRows()).toHaveLength(3);
    expect(
      screen.queryByRole('group', { name: 'Filters' }),
    ).not.toBeInTheDocument();
  });

  it('filters three models by provider, together with the search', async () => {
    mockModelRows = [sonnet, qwen, model(3, 'Anthropic')];
    await renderPanel();

    expect(chips()).toEqual(['All 3', 'Anthropic 2', 'Ollama 1']);
    await userEvent.click(screen.getByRole('radio', { name: 'Ollama 1' }));
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('Qwen 2.5')).toBeInTheDocument();
  });

  it('says when a provider and the search leave nothing, and clears the filter', async () => {
    mockModelRows = [sonnet, qwen];
    await renderPanel('sonnet');

    expect(chips()).toEqual(['All 1', 'Anthropic 1', 'Ollama 0']);
    await userEvent.click(screen.getByRole('radio', { name: 'Ollama 0' }));
    expect(
      screen.getByText('No models match “sonnet” with these filters.'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Clear filters' }),
    );
    expect(bodyRows()).toHaveLength(1);
  });

  it('filters 300 models from four providers, paging from the first page', async () => {
    const providers = ['Anthropic', 'OpenAI', 'Ollama', 'vLLM'];
    mockModelRows = Array.from({ length: 300 }, (_, index) =>
      model(index, providers[index % 4]),
    );
    await renderPanel();

    expect(chips()).toEqual([
      'All 300',
      'Anthropic 75',
      'Ollama 75',
      'OpenAI 75',
      'vLLM 75',
    ]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more models' }),
    );
    expect(bodyRows()).toHaveLength(40);

    await userEvent.click(screen.getByRole('radio', { name: 'vLLM 75' }));
    expect(bodyRows()).toHaveLength(20);
    expect(screen.getByText('20 models shown, 55 more')).toBeInTheDocument();
  });
});
