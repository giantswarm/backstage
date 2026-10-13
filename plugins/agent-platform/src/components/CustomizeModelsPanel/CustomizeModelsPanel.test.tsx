import { useState } from 'react';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { useLocation } from 'react-router-dom';
import { ShellScopeProvider } from '@giantswarm/backstage-plugin-ui-react';
import {
  type MockedLayout,
  mockDesktopLayout,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
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
let mockUnreachableInstallations: string[] = [];
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
    unreachableInstallations: mockUnreachableInstallations,
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

// Re-render the panel from inside the test app (its own `rerender` would drop
// the app around it), so a test can change what the mocked providers answer
// and watch one mounted panel follow.
let rerenderPanel: () => void = () => {};
function RerenderablePanel() {
  const [, setTick] = useState(0);
  rerenderPanel = () => setTick(tick => tick + 1);
  return <CustomizeModelsPanel search="" />;
}

function renderRerenderablePanel() {
  return renderInTestApp(<RerenderablePanel />, {
    mountedRoutes: { '/agent-platform/models': modelsRouteRef },
  });
}

describe('CustomizeModelsPanel', () => {
  beforeEach(() => {
    mockModelRows = [sonnet, qwen];
    mockModelsLoading = false;
    mockUnreachableInstallations = [];
    mockServingInstallations = [];
  });

  it('lists the models with their usage and state', async () => {
    await renderPanel();

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringMatching(/Sonnet 4\.5.*Anthropic.*Used by 2 agents.*Ready/),
      expect.stringMatching(/Qwen 2\.5.*Ollama.*Not used yet.*Not serving/),
    ]);
  });

  it('makes each name a link to the model (M21)', async () => {
    await renderPanel();

    const row = screen.getAllByRole('row')[1];
    expect(
      within(row).getByRole('link', { name: 'Sonnet 4.5' }),
    ).toHaveAttribute('href', row.getAttribute('data-href'));
  });

  it('links each model to its page beside Customize › Models', async () => {
    await renderPanel();

    expect(screen.getByRole('link', { name: 'Sonnet 4.5' })).toHaveAttribute(
      'href',
      '/customize/models/golem/support/sonnet',
    );
  });

  describe('a model the controller did not accept', () => {
    const rejected: ModelRow = {
      ...sonnet,
      id: 'golem/support/mistral',
      name: 'mistral',
      displayName: 'Mistral',
      readiness: 'notAccepted',
      readinessMessage: 'Secret support/mistral-key not found',
    };

    function PathProbe() {
      return <div data-testid="path">{useLocation().pathname}</div>;
    }

    it('keeps the label short and gives the reason in a hint, without opening the model', async () => {
      mockModelRows = [rejected, sonnet];
      await renderInTestApp(
        <ShellScopeProvider>
          <PathProbe />
          <CustomizeModelsPanel search="" />
        </ShellScopeProvider>,
        { mountedRoutes: { '/agent-platform/models': modelsRouteRef } },
      );
      const path = screen.getByTestId('path').textContent;

      const row = screen.getAllByRole('row')[1];
      expect(within(row).getByText('Not accepted')).toBeInTheDocument();
      expect(
        within(row).queryByText('Secret support/mistral-key not found'),
      ).toBeNull();

      await userEvent.click(
        within(row).getByRole('button', { name: 'About the state of Mistral' }),
      );

      expect(
        await screen.findByRole('dialog', {
          name: 'About the state of Mistral',
        }),
      ).toHaveTextContent('Secret support/mistral-key not found');
      // The press stays with the hint: the row does not open the model.
      expect(screen.getByTestId('path')).toHaveTextContent(path ?? '');
    });

    it('gives an accepted model no hint', async () => {
      await renderPanel();
      expect(
        screen.queryByRole('button', { name: /^About the state of/ }),
      ).toBeNull();
    });
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

  it('holds the read warning until the read settles', async () => {
    mockModelRows = [];
    mockModelsLoading = true;
    mockUnreachableInstallations = ['lab'];
    await renderRerenderablePanel();
    expect(
      await screen.findByLabelText('Reading your models…'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    mockModelsLoading = false;
    act(() => rerenderPanel());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not read 1 environment',
    );
    expect(screen.queryByText('No models yet')).not.toBeInTheDocument();
  });
});

describe('CustomizeModelsPanel at phone width (T22 C7)', () => {
  let layout: MockedLayout;
  const headers = () =>
    screen.getAllByRole('columnheader').map(header => header.textContent);
  const bodyRows = () => screen.getAllByRole('row').slice(1);
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

  beforeEach(() => {
    mockModelRows = [sonnet, qwen];
    mockModelsLoading = false;
    mockServingInstallations = [];
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it("keeps the model and its status, the usage joining the name's line", async () => {
    await renderPanel();

    expect(headers()).toEqual(['Model', 'Status']);
    const [sonnetRow, qwenRow] = bodyRows();
    expect(
      within(sonnetRow).getByText(
        'Anthropic · claude-sonnet-4-5 · Used by 2 agents',
      ),
    ).toBeInTheDocument();
    expect(within(sonnetRow).getByText('Ready')).toBeInTheDocument();
    expect(
      within(qwenRow).getByText('Ollama · qwen2.5:32b · Not used yet'),
    ).toBeInTheDocument();
    expect(within(qwenRow).getByText('Not serving')).toBeInTheDocument();
  });

  it('brings the Used by column back on a wide viewport', async () => {
    layout.restore();
    layout = mockDesktopLayout();
    await renderPanel();

    expect(headers()).toEqual(['Model', 'Used by', 'Status']);
    const [sonnetRow] = bodyRows();
    expect(
      within(sonnetRow).getByText('Anthropic · claude-sonnet-4-5'),
    ).toBeInTheDocument();
    expect(within(sonnetRow).getByText('Used by 2 agents')).toBeInTheDocument();
  });

  it('draws three models with no paging chrome', async () => {
    mockModelRows = manyModels(3);
    await renderPanel();

    expect(bodyRows()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /more|fewer/i })).toBeNull();
    expect(screen.queryByText(/shown/)).toBeNull();
  });

  it('windows 300 models and keeps the provider filter', async () => {
    mockModelRows = manyModels(300);
    await renderPanel();

    expect(headers()).toEqual(['Model', 'Status']);
    expect(bodyRows()).toHaveLength(20);
    expect(screen.getByText('20 models shown, 280 more')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more models' }),
    );
    expect(bodyRows()).toHaveLength(40);
    expect(
      screen.getByRole('button', { name: /Filter by provider/, hidden: true }),
    ).toBeInTheDocument();
  });
});

describe('CustomizeModelsPanel provider filter (T49, T64)', () => {
  const bodyRows = () => screen.getAllByRole('row').slice(1);
  /** The provider dropdown; `hidden` keeps it readable while it is open. */
  const providerDropdown = () =>
    screen.getByRole('button', { name: /Filter by provider/, hidden: true });
  /** The provider dropdown's options, as "label count", read and closed. */
  const providerOptions = async () => {
    await userEvent.click(providerDropdown());
    const options = within(await screen.findByRole('listbox'))
      .getAllByRole('option')
      .map(option => option.textContent);
    await userEvent.keyboard('{Escape}');
    return options;
  };
  /** Toggles one provider. */
  const pickProvider = async (option: string) => {
    await userEvent.click(providerDropdown());
    await userEvent.click(await screen.findByRole('option', { name: option }));
    await userEvent.keyboard('{Escape}');
  };
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

  it('offers a one-option provider dropdown over three models of one provider', async () => {
    mockModelRows = [0, 1, 2].map(index => model(index, 'Anthropic'));
    await renderPanel();

    expect(bodyRows()).toHaveLength(3);
    expect(providerDropdown()).toHaveTextContent('ProviderAll');
    expect(await providerOptions()).toEqual(['Anthropic 3']);
  });

  it('filters three models by provider, together with the search', async () => {
    mockModelRows = [sonnet, qwen, model(3, 'Anthropic')];
    await renderPanel();

    expect(await providerOptions()).toEqual(['Anthropic 2', 'Ollama 1']);
    await pickProvider('Ollama 1');
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('Qwen 2.5')).toBeInTheDocument();
    await pickProvider('Anthropic 2');
    expect(bodyRows()).toHaveLength(3);
  });

  it('says when a provider and the search leave nothing, and clears the filter', async () => {
    mockModelRows = [sonnet, qwen];
    await renderPanel('sonnet');

    expect(await providerOptions()).toEqual(['Anthropic 1', 'Ollama 0']);
    await pickProvider('Ollama 0');
    expect(
      screen.getByText('No models match “sonnet” with these filters.'),
    ).toBeInTheDocument();
    // The empty state's way back (the bar offers the same).
    const [, emptyStateClear] = screen.getAllByRole('button', {
      name: 'Clear filters',
    });
    await userEvent.click(emptyStateClear);
    expect(bodyRows()).toHaveLength(1);
  });

  it('filters 300 models from four providers, paging from the first page', async () => {
    const providers = ['Anthropic', 'OpenAI', 'Ollama', 'vLLM'];
    mockModelRows = Array.from({ length: 300 }, (_, index) =>
      model(index, providers[index % 4]),
    );
    await renderPanel();

    expect(await providerOptions()).toEqual([
      'Anthropic 75',
      'Ollama 75',
      'OpenAI 75',
      'vLLM 75',
    ]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more models' }),
    );
    expect(bodyRows()).toHaveLength(40);

    await pickProvider('vLLM 75');
    expect(bodyRows()).toHaveLength(20);
    expect(screen.getByText('20 models shown, 55 more')).toBeInTheDocument();

    await pickProvider('Ollama 75');
    expect(screen.getByText('20 models shown, 130 more')).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Filters' })).getByRole(
        'button',
        { name: 'Clear filters' },
      ),
    );
    expect(screen.getByText('20 models shown, 280 more')).toBeInTheDocument();
  });
});
