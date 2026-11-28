import { useState } from 'react';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { useLocation } from 'react-router-dom';
import { ShellScopeProvider } from '@giantswarm/backstage-plugin-ui-react';
import {
  type MockedLayout,
  mockContainerWidth,
  mockDesktopLayout,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import type { AgentRow } from '../AgentsDataProvider';
import type { ModelRow } from '../ModelsTable';
import { customizeExternalRouteRef, modelsRouteRef } from '../../routes';
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
  id: 'golem/support/qwen',
  name: 'qwen',
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
/** How far the agents are read: still loading, and where they could not be. */
let mockAgentsRead: {
  isLoading: boolean;
  isLoadingMore: boolean;
  unreachableInstallations: string[];
  noAccessInstallations: string[];
};
const AGENTS_READ = {
  isLoading: false,
  isLoadingMore: false,
  unreachableInstallations: [],
  noAccessInstallations: [],
};
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
// The organization namespaces agent-manager names, by namespace.
let mockDirectory = new Map<
  string,
  {
    namespace: string;
    organization: string;
    displayName?: string;
  }
>();
jest.mock('../OrganizationDirectoryProvider', () => ({
  useOrganizationDirectory: () => ({ directory: mockDirectory }),
}));
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => ({ rows: agents, ...mockAgentsRead }),
}));
function renderPanel(search = '') {
  return renderInTestApp(<CustomizeModelsPanel search={search} />, {
    mountedRoutes: {
      '/customize/models': modelsRouteRef,
      '/customize': customizeExternalRouteRef,
    },
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
    mountedRoutes: {
      '/customize/models': modelsRouteRef,
      '/customize': customizeExternalRouteRef,
    },
  });
}

const headers = () =>
  screen.getAllByRole('columnheader').map(header => header.textContent);
const bodyRows = () => screen.getAllByRole('row').slice(1);
/** A row's cells after the model's, by column: Owner, Provider, Environment… */
const cellsOf = (row: HTMLElement) =>
  [...row.querySelectorAll<HTMLElement>('[data-column-index]')].slice(1);

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

const LAB_NAMESPACE = 'agents-lab-x7k2q';
const labDirectory = () =>
  new Map([
    [
      LAB_NAMESPACE,
      {
        namespace: LAB_NAMESPACE,
        organization: 'default',
        displayName: 'Lab',
      },
    ],
  ]);

beforeEach(() => {
  mockAgentsRead = { ...AGENTS_READ };
});

describe('CustomizeModelsPanel', () => {
  beforeEach(() => {
    mockModelRows = [sonnet, qwen];
    mockModelsLoading = false;
    mockUnreachableInstallations = [];
    mockDirectory = new Map();
  });

  it('shows each model with its owner, provider, environment, use and state', async () => {
    await renderPanel();

    expect(headers()).toEqual([
      'Model',
      'Owner',
      'Provider',
      'Environment',
      'Used by',
      'Status',
    ]);
    expect(bodyRows().map(row => row.textContent)).toEqual([
      expect.stringMatching(
        /^Qwen 2\.5qwen2\.5:32bsupportOllamagolem–No agent uses this modelNot serving$/,
      ),
      expect.stringMatching(
        /^Sonnet 4\.5claude-sonnet-4-5supportAnthropicgolem2 agentsConfigured$/,
      ),
    ]);
  });

  it('marks the default models, the platform’s too, with a badge', async () => {
    mockDirectory = labDirectory();
    const platform: ModelRow = {
      ...sonnet,
      id: 'golem/kagent/platform-default',
      name: 'platform-default',
      displayName: 'platform-default',
      namespace: 'kagent',
      isDefault: true,
    };
    mockModelRows = [
      platform,
      { ...sonnet, namespace: LAB_NAMESPACE, isDefault: true },
      qwen,
    ];
    await renderPanel();

    const [platformRow, qwenRow, labRow] = bodyRows();
    expect(within(platformRow).getByText('Default')).toBeInTheDocument();
    expect(
      within(platformRow).getByTitle(
        'The default model of Platform on golem: new agents there start with it.',
      ),
    ).toBeInTheDocument();
    expect(within(labRow).getByText('Default')).toBeInTheDocument();
    expect(within(qwenRow).queryByText('Default')).toBeNull();
  });

  it('names the owner: the platform, an organization by its display name, a namespace muted', async () => {
    mockDirectory = labDirectory();
    mockModelRows = [
      { ...sonnet, id: 'golem/kagent/a', namespace: 'kagent' },
      { ...sonnet, id: `golem/${LAB_NAMESPACE}/a`, namespace: LAB_NAMESPACE },
      sonnet,
    ];
    await renderPanel();

    const owners = bodyRows().map(row => cellsOf(row)[0]);
    expect(owners.map(cell => cell.textContent)).toEqual([
      'Lab',
      'Platform',
      'support',
    ]);
    expect(within(owners[2]).getByText('support')).toHaveAttribute(
      'title',
      'Namespace support, no organization',
    );
  });

  it('names the provider as the add-model form does, and an unknown one as it is', async () => {
    mockModelRows = [
      { ...sonnet, id: 'a', displayName: 'A', provider: 'GeminiVertexAI' },
      { ...sonnet, id: 'b', displayName: 'B', provider: 'Bedrock' },
      { ...sonnet, id: 'c', displayName: 'C', provider: 'Acme' },
    ];
    await renderPanel();

    expect(bodyRows().map(row => cellsOf(row)[1].textContent)).toEqual([
      'Gemini on Vertex AI',
      'Amazon Bedrock',
      'Acme',
    ]);
  });

  it('counts the agents on each model, a dash saying none in words', async () => {
    await renderPanel();

    const [qwenRow, sonnetRow] = bodyRows();
    expect(within(sonnetRow).getByText('2 agents')).toBeInTheDocument();
    const usedBy = cellsOf(qwenRow)[3];
    expect(within(usedBy).getByText('–')).toHaveAttribute('aria-hidden');
    // Named in words for assistive technology, and on hover.
    expect(usedBy).toHaveTextContent('No agent uses this model');
    expect(
      within(usedBy).getByTitle('No agent uses this model'),
    ).toBeInTheDocument();
  });

  it('counts nothing while some environment’s agents are still read', async () => {
    mockAgentsRead.isLoadingMore = true;
    await renderPanel();

    for (const row of bodyRows()) {
      const usedBy = cellsOf(row)[3];
      expect(usedBy).not.toHaveTextContent(/\d agents?|–/);
      expect(usedBy).toHaveTextContent('The agents are still being read.');
    }
    // Neither in use nor unused as far as the list knows: no Used by filter.
    expect(
      screen.queryByRole('button', { name: /Filter by used by/, hidden: true }),
    ).toBeNull();
  });

  it('counts nothing for models on an environment whose agents could not be read', async () => {
    const elsewhere: ModelRow = {
      ...qwen,
      id: 'gerbil/support/qwen',
      installation: 'gerbil',
    };
    mockModelRows = [sonnet, qwen, elsewhere];
    mockAgentsRead.unreachableInstallations = ['gerbil'];
    await renderPanel();

    const gerbilRow = bodyRows().find(
      row => cellsOf(row)[2].textContent === 'gerbil',
    )!;
    expect(cellsOf(gerbilRow)[3]).toHaveTextContent(
      'The agents on gerbil could not be read.',
    );
    expect(cellsOf(gerbilRow)[3]).not.toHaveTextContent('–');
  });

  it('sorts by model, then owner and environment, and by a header clicked', async () => {
    mockDirectory = labDirectory();
    mockModelRows = [
      { ...sonnet, id: 'z/support/s', installation: 'zeta' },
      sonnet,
      { ...sonnet, id: `golem/${LAB_NAMESPACE}/s`, namespace: LAB_NAMESPACE },
      qwen,
    ];
    await renderPanel();

    const model = screen.getByRole('columnheader', { name: /Model/ });
    expect(model).toHaveAttribute('aria-sort', 'ascending');
    expect(
      bodyRows().map(row => {
        const [owner, , environment] = cellsOf(row);
        return `${within(row).getByRole('rowheader').textContent?.slice(0, 8)} ${owner.textContent} ${environment.textContent}`;
      }),
    ).toEqual([
      'Qwen 2.5 support golem',
      'Sonnet 4 Lab golem',
      'Sonnet 4 support golem',
      'Sonnet 4 support zeta',
    ]);

    await userEvent.click(
      screen.getByRole('columnheader', { name: /Used by/ }),
    );
    expect(
      screen.getByRole('columnheader', { name: /Used by/ }),
    ).toHaveAttribute('aria-sort', 'ascending');
    expect(bodyRows()[0]).toHaveTextContent('Qwen 2.5');
    expect(bodyRows()[3]).toHaveTextContent('2 agents');
  });

  it('lists every model, with no paging', async () => {
    mockModelRows = manyModels(300);
    await renderPanel();

    expect(bodyRows()).toHaveLength(300);
    expect(screen.queryByRole('button', { name: /^Show / })).toBeNull();
    expect(screen.queryByText(/shown/)).toBeNull();
  });

  it('names the resource of models alike in name, owner and environment, and only theirs', async () => {
    const twin = { ...sonnet, id: 'golem/support/sonnet-2', name: 'sonnet-2' };
    mockModelRows = [sonnet, twin, qwen];
    await renderPanel();

    const [qwenRow, first, second] = bodyRows();
    expect(first).toHaveTextContent('claude-sonnet-4-5 (sonnet)');
    expect(second).toHaveTextContent('claude-sonnet-4-5 (sonnet-2)');
    expect(qwenRow).not.toHaveTextContent('(');
  });

  it('tells apart owners that read alike by their namespace, in the cell, the filter and the sort', async () => {
    const other = 'agents-lab-9q2zz';
    mockDirectory = new Map([
      ...labDirectory(),
      [
        other,
        {
          namespace: other,
          organization: 'lab',
          displayName: 'Lab',
        },
      ],
    ]);
    mockModelRows = [
      {
        ...sonnet,
        id: `golem/${other}/default`,
        name: 'default',
        namespace: other,
      },
      {
        ...sonnet,
        id: `golem/${LAB_NAMESPACE}/default`,
        name: 'default',
        namespace: LAB_NAMESPACE,
      },
      qwen,
    ];
    await renderPanel();

    const [, first, second] = bodyRows();
    // Sorted by owner, then by namespace; each names its namespace.
    expect(cellsOf(first)[0]).toHaveTextContent(`Lab${other}`);
    expect(cellsOf(second)[0]).toHaveTextContent(`Lab${LAB_NAMESPACE}`);
    // No resource name: the two models are in different namespaces.
    expect(first).not.toHaveTextContent('(default)');

    await userEvent.click(
      screen.getByRole('button', { name: /Filter by owner/, hidden: true }),
    );
    const options = within(await screen.findByRole('listbox'))
      .getAllByRole('option')
      .map(option => option.textContent);
    expect(options).toEqual(
      expect.arrayContaining([
        `Lab (${LAB_NAMESPACE}) 1`,
        `Lab (${other}) 1`,
        'support 1',
      ]),
    );
  });

  it('makes each name a link to the model (M21)', async () => {
    await renderPanel();

    const row = bodyRows()[1];
    const link = within(row).getByRole('link', { name: 'Sonnet 4.5' });
    expect(link).toHaveAttribute('href', row.getAttribute('data-href'));
    expect(link).toHaveAttribute(
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
        {
          mountedRoutes: {
            '/customize/models': modelsRouteRef,
            '/customize': customizeExternalRouteRef,
          },
        },
      );
      const path = screen.getByTestId('path').textContent;

      const row = bodyRows()[0];
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

    it('explains that a configured model has not had provider access tested', async () => {
      await renderInTestApp(
        <ShellScopeProvider>
          <CustomizeModelsPanel search="" />
        </ShellScopeProvider>,
        {
          mountedRoutes: {
            '/customize/models': modelsRouteRef,
            '/customize': customizeExternalRouteRef,
          },
        },
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'About the state of Sonnet 4.5' }),
      );
      expect(
        await screen.findByRole('dialog', {
          name: 'About the state of Sonnet 4.5',
        }),
      ).toHaveTextContent(
        'Settings accepted. Provider access has not been tested.',
      );
    });
  });

  it('narrows to the search, by name, owner and provider as they read', async () => {
    mockModelRows = [sonnet, { ...qwen, provider: 'GeminiVertexAI' }];
    const { unmount } = await renderPanel('qwen');
    expect(screen.getByText('Qwen 2.5')).toBeInTheDocument();
    expect(screen.queryByText('Sonnet 4.5')).not.toBeInTheDocument();
    unmount();

    await renderPanel('on vertex');
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('Qwen 2.5')).toBeInTheDocument();
  });

  it('says how to add a model when there is none', async () => {
    mockModelRows = [];
    await renderPanel();
    expect(screen.getByText('No models yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add a model for agents to run on.'),
    ).toBeInTheDocument();
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

describe('CustomizeModelsPanel as its card narrows', () => {
  let layout: MockedLayout;

  beforeEach(() => {
    mockModelRows = [sonnet, qwen];
    mockModelsLoading = false;
    mockDirectory = new Map();
    layout = mockDesktopLayout();
  });
  afterEach(() => layout.restore());

  it('names the owner and environment under the model id, then stacks the rows', async () => {
    const container = mockContainerWidth(1000);
    try {
      await renderPanel();
      expect(headers()).toHaveLength(6);

      // Beside the side rail at 1024px.
      act(() => container.setWidth(700));
      expect(headers()).toEqual(['Model', 'Provider', 'Used by', 'Status']);
      expect(
        within(bodyRows()[1]).getByText('claude-sonnet-4-5 · support · golem'),
      ).toBeInTheDocument();

      // Beside the side rail at 768px.
      act(() => container.setWidth(424));
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.getByRole('list', { name: 'Models' })).toBeInTheDocument();
    } finally {
      container.restore();
    }
  });

  it('moves a sort on a column it leaves out back to the model', async () => {
    const container = mockContainerWidth(1000);
    try {
      await renderPanel();
      await userEvent.click(
        screen.getByRole('columnheader', { name: /Environment/ }),
      );
      act(() => container.setWidth(700));
      expect(
        screen.getByRole('columnheader', { name: /Model/ }),
      ).toHaveAttribute('aria-sort', 'ascending');
    } finally {
      container.restore();
    }
  });
});

describe('CustomizeModelsPanel at phone width', () => {
  let layout: MockedLayout;

  beforeEach(() => {
    mockModelRows = [sonnet, qwen];
    mockModelsLoading = false;
    mockDirectory = new Map();
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it('stacks a row per model: its name, badge and state, then its facts', async () => {
    mockModelRows = [{ ...sonnet, isDefault: true }, qwen];
    await renderPanel();

    expect(screen.queryByRole('table')).toBeNull();
    const [qwenItem, sonnetItem] = within(
      screen.getByRole('list', { name: 'Models' }),
    ).getAllByRole('listitem');
    expect(
      within(sonnetItem).getByRole('link', { name: 'Sonnet 4.5' }),
    ).toHaveAttribute('href', '/customize/models/golem/support/sonnet');
    expect(within(sonnetItem).getByText('Default')).toBeInTheDocument();
    expect(within(sonnetItem).getByText('Configured')).toBeInTheDocument();
    expect(sonnetItem).toHaveTextContent(
      'claude-sonnet-4-5·support·golem·Used by 2 agents',
    );
    expect(qwenItem).toHaveTextContent('Not used yet');
  });

  it('lists every model and keeps the filters', async () => {
    mockModelRows = manyModels(300).map((each, i) =>
      i % 2 ? { ...each, provider: 'Ollama' } : each,
    );
    await renderPanel();

    expect(
      within(screen.getByRole('list', { name: 'Models' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(300);
    expect(
      screen.getByRole('button', { name: /Filter by provider/, hidden: true }),
    ).toBeInTheDocument();
  });
});

describe('CustomizeModelsPanel filters', () => {
  /** A dropdown; `hidden` keeps it readable while it is open. */
  const dropdown = (field: string) =>
    screen.getByRole('button', {
      name: new RegExp(`Filter by ${field}`),
      hidden: true,
    });
  /** A dropdown's options, as "label count", read and closed. */
  const optionsOf = async (field: string) => {
    await userEvent.click(dropdown(field));
    const options = within(await screen.findByRole('listbox'))
      .getAllByRole('option')
      .map(option => option.textContent);
    await userEvent.keyboard('{Escape}');
    return options;
  };
  /** Toggles one option. */
  const pick = async (field: string, option: string) => {
    await userEvent.click(dropdown(field));
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
    mockDirectory = new Map();
  });

  it('offers no dropdown that could not narrow the list', async () => {
    mockModelRows = [0, 1, 2].map(index => model(index, 'Anthropic'));
    await renderPanel();

    expect(bodyRows()).toHaveLength(3);
    expect(screen.queryByRole('group', { name: 'Filters' })).toBeNull();
  });

  it('filters by owner, provider, status and use, alone and together with the search', async () => {
    mockDirectory = labDirectory();
    mockModelRows = [
      sonnet,
      qwen,
      { ...model(3, 'Anthropic'), namespace: LAB_NAMESPACE, id: 'lab/m-3' },
    ];
    await renderPanel();

    expect(await optionsOf('owner')).toEqual(['support 2', 'Lab 1']);
    expect(await optionsOf('provider')).toEqual(['Anthropic 2', 'Ollama 1']);
    expect(await optionsOf('status')).toEqual([
      'Configured 2',
      'Not serving 1',
    ]);
    expect(await optionsOf('used by')).toEqual(['In use 1', 'Not used 2']);

    await pick('used by', 'Not used 2');
    expect(bodyRows()).toHaveLength(2);
    await pick('owner', 'support 1');
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('Qwen 2.5')).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Filters' })).getByRole(
        'button',
        { name: 'Clear filters' },
      ),
    );
    expect(bodyRows()).toHaveLength(3);
  });

  it('says when the filters and the search leave nothing, with one way back', async () => {
    mockModelRows = [sonnet, qwen];
    await renderPanel('sonnet');

    await pick('provider', 'Ollama 0');
    expect(
      screen.getByText('No models match “sonnet” with these filters.'),
    ).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Clear filters' });
    expect(clear).toHaveLength(1);
    await userEvent.click(clear[0]);
    expect(bodyRows()).toHaveLength(1);
  });
});
