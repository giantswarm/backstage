import { Link as RouterLink, Route, Routes } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import { mockPhoneLayout } from '@giantswarm/backstage-plugin-ui-react/testUtils';

import type { LlmUsageView } from '../../hooks/useLlmUsage';
import type { LlmUsage } from '../../lib/llmUsage';
import {
  customizeExternalRouteRef,
  agentsRouteRef,
  modelsRouteRef,
} from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import { ModelDetailPage } from './ModelDetailPage';

const mockUseResource = jest.fn();
let mockMayUpdate = true;
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: (...args: unknown[]) => mockUseResource(...args),
  useSelfSubjectAccessReview: () => ({
    allowed: mockMayUpdate,
    isLoading: false,
  }),
}));

let mockContextWindows: Record<string, unknown> | undefined;
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: {
      getOptional: (key: string) =>
        key === 'agentPlatform.models.contextWindows'
          ? mockContextWindows
          : undefined,
    },
    isLoading: false,
  }),
}));

// No serving layer: the model points at a provider's own endpoint.
jest.mock('../ServingProvider', () => ({
  useServing: () => ({
    servingStateFor: () => undefined,
    capabilitiesFor: () => ({}),
    backends: {},
  }),
}));

// Avatars come from the installations' config: not what this test is about.
jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));

jest.mock('../InstallationChip', () => ({
  InstallationChip: () => null,
}));

jest.mock('../../hooks/useDeleteModelConfig', () => ({
  useDeleteModelConfig: () => ({
    isDeletable: false,
    isCheckingDeletable: false,
    deleteModelConfig: jest.fn(),
    isDeleting: false,
    error: null,
    reset: jest.fn(),
  }),
}));

// The gateway's figures, as the Usage screen's hook reduces them.
let mockLlmUsage: LlmUsageView;
let mockLlmUsageInstallations: Array<string | undefined> = [];
jest.mock('../../hooks/useLlmUsage', () => ({
  useLlmUsage: (installation: string | undefined) => {
    mockLlmUsageInstallations.push(installation);
    return mockLlmUsage;
  },
}));

// The fleet's agents, as the Customize page's provider lists them.
let mockAgents: AgentRow[] = [];
let mockAgentsLoading = false;
let mockUnreachableInstallations: string[] = [];
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => ({
    rows: mockAgents,
    isLoading: mockAgentsLoading,
    unreachableInstallations: mockUnreachableInstallations,
  }),
}));

// The chart itself is ui-react's; what matters here is which series it gets,
// and whether it draws a key.
jest.mock('../LlmUsage', () => ({
  ...jest.requireActual('../LlmUsage'),
  CostPerDayCard: ({
    daily,
    showLegend,
  }: {
    daily: { series: string[] };
    showLegend?: boolean;
  }) => (
    <div data-testid="cost-per-day" data-legend={String(showLegend ?? true)}>
      {daily.series.join(',')}
    </div>
  ),
}));

function sonnet(overrides: Partial<ModelConfigInterface['metadata']> = {}) {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: {
        name: 'sonnet',
        namespace: 'kagent',
        creationTimestamp: '2026-09-01T10:00:00Z',
        generation: 1,
        annotations: { 'ui.giantswarm.io/display-name': 'Sonnet 4.5' },
        ...overrides,
      },
      spec: {
        provider: 'Anthropic',
        model: 'claude-sonnet-4-5',
        apiKeySecret: 'sonnet-key',
        apiKeySecretKey: 'ANTHROPIC_API_KEY',
      },
      status: {
        observedGeneration: 1,
        conditions: [
          {
            type: 'Accepted',
            status: 'True',
            reason: 'Accepted',
            message: '',
            lastTransitionTime: '2026-09-01T10:00:00Z',
          },
          {
            type: 'ResolvedRefs',
            status: 'True',
            reason: 'ResolvedRefs',
            message: '',
            lastTransitionTime: '2026-09-01T10:00:00Z',
          },
        ],
      },
    } as ModelConfigInterface,
    'inst-1',
  );
}

function gatewayUsage(): LlmUsage {
  return {
    byModel: [
      {
        id: 'm',
        model: 'claude-sonnet-4-5-20250929',
        tokens: 21_900_000,
        calls: 8412,
        costUsd: 61.3,
        usdPerMillion: undefined,
        avgTokensPerCall: undefined,
        sharePct: undefined,
      },
    ],
    byAgentModel: [
      {
        id: 'a',
        namespace: 'kagent',
        agent: 'support-triage',
        model: 'claude-sonnet-4-5-20250929',
        tokens: 15_000_000,
        calls: 6000,
        costUsd: 38.4,
      },
    ],
    costPerDay: {
      series: ['claude-sonnet-4-5-20250929'],
      rows: [{ day: '2026-10-09', 'claude-sonnet-4-5-20250929': 2 }],
    },
  } as unknown as LlmUsage;
}

const agent = (name: string, technicalName: string, modelConfigId?: string) =>
  ({
    id: `inst-1/kagent/${technicalName}`,
    installation: 'inst-1',
    namespace: 'kagent',
    name,
    technicalName,
    description: '',
    ...(modelConfigId ? { modelConfigId } : {}),
  }) as AgentRow;

function renderPage(path = '/customize/models/inst-1/kagent/sonnet') {
  return renderInTestApp(
    <PageHeaderActionsProvider>
      <Routes>
        <Route
          path="/customize/models/:installation/:namespace/:name/*"
          element={<ModelDetailPage />}
        />
        <Route
          path="/agent-platform/models/edit/:installation/:namespace/:name"
          element={<p>The Connect-a-model flow, prefilled</p>}
        />
      </Routes>
      {/* Another model under the same route, as the palette opens one. */}
      <RouterLink to="/customize/models/inst-1/kagent/haiku">
        Next model
      </RouterLink>
    </PageHeaderActionsProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: {
        '/agent-platform/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
        '/agent-platform/agents': agentsRouteRef,
      },
    },
  );
}

/** A model whose key Secret the controller could not find. */
function rejectedSonnet() {
  const rejected = sonnet();
  rejected.jsonData.status!.conditions![1] = {
    type: 'ResolvedRefs',
    status: 'False',
    reason: 'SecretNotFound',
    message: 'Secret kagent/sonnet-key not found',
    lastTransitionTime: '2026-09-01T10:00:00Z',
  };
  return rejected;
}

const USAGE = '/customize/models/inst-1/kagent/sonnet/usage';
const USED_BY = '/customize/models/inst-1/kagent/sonnet/used-by';

describe('ModelDetailPage', () => {
  beforeEach(() => {
    mockLlmUsageInstallations = [];
    mockMayUpdate = true;
    mockContextWindows = undefined;
    mockUseResource.mockReturnValue({
      resource: sonnet(),
      isLoading: false,
      errors: [],
    });
    mockLlmUsage = {
      usage: gatewayUsage(),
      isLoading: false,
      isError: false,
      isAvailable: true,
    };
    mockAgentsLoading = false;
    mockUnreachableInstallations = [];
    mockAgents = [
      agent('Support Triage', 'support-triage', 'inst-1/kagent/sonnet'),
      agent('Research Assistant', 'researcher', 'inst-1/kagent/sonnet'),
      agent('Copywriter', 'copywriter', 'inst-1/kagent/gpt'),
    ];
  });

  it('opens as a read view with the model as the title, its status and its tabs', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Sonnet 4.5' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    // Used by counts the agents on the model, as on the skill page.
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'Usage',
      'Used by (2)',
    ]);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // One column: no facts beside the content.
    expect(screen.queryByRole('complementary')).toBeNull();
    // No form on this page at all: Edit opens the Connect-a-model flow.
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByLabelText(/Model ID|^Model$/)).toBeNull();
  });

  it('says in plain words why agents cannot use a model whose key kagent cannot find, though it accepted the settings', async () => {
    // Accepted is True; only ResolvedRefs failed.
    mockUseResource.mockReturnValue({
      resource: rejectedSonnet(),
      isLoading: false,
      errors: [],
    });
    await renderPage();

    // Named by the condition that failed, not "Not accepted".
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.queryByText('Not accepted')).toBeNull();
    expect(
      screen.getByText('Agents cannot use this model'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The API key it needs cannot be found. Enter the key again with Edit.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/accept this model/)).toBeNull();
    // kagent's own words stay in Technical details, open below, once.
    expect(
      screen.getByRole('button', { name: 'Technical details' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('SecretNotFound')).toBeInTheDocument();
    expect(
      screen.getAllByText('Secret kagent/sonnet-key not found'),
    ).toHaveLength(1);
  });

  it('names whom to ask about a missing key when the person cannot edit the model', async () => {
    mockMayUpdate = false;
    mockUseResource.mockReturnValue({
      resource: rejectedSonnet(),
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(
      screen.getByText(
        'The API key it needs cannot be found. Ask your platform team to add the key.',
      ),
    ).toBeInTheDocument();
  });

  it('calls a model whose settings kagent rejected Not accepted', async () => {
    const invalid = sonnet();
    invalid.jsonData.status!.conditions![0] = {
      type: 'Accepted',
      status: 'False',
      reason: 'InvalidProviderConfig',
      message: 'anthropic model config is required',
      lastTransitionTime: '2026-09-01T10:00:00Z',
    };
    mockUseResource.mockReturnValue({
      resource: invalid,
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(screen.getByText('Not accepted')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Its settings are incomplete for its provider. Complete them with Edit.',
      ),
    ).toBeInTheDocument();
  });

  it('opens Technical details and scrolls to them on Show conditions', async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mockUseResource.mockReturnValue({
      resource: rejectedSonnet(),
      isLoading: false,
      errors: [],
    });
    await renderPage();
    const technical = screen.getByRole('button', {
      name: 'Technical details',
    });
    // Folded away by the person after arriving.
    await userEvent.click(technical);
    expect(technical).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(
      screen.getByRole('button', { name: 'Show conditions' }),
    );

    expect(
      screen.getByRole('button', { name: 'Technical details' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('SecretNotFound')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('says why on Overview only', async () => {
    mockUseResource.mockReturnValue({
      resource: rejectedSonnet(),
      isLoading: false,
      errors: [],
    });
    await renderPage(USAGE);

    // The badge still says so on every tab.
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.queryByText('Agents cannot use this model')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Show conditions' }),
    ).toBeNull();
  });

  it('says kagent has not checked the latest change of a stale model yet', async () => {
    const stale = rejectedSonnet();
    stale.jsonData.metadata.generation = 2;
    mockUseResource.mockReturnValue({
      resource: stale,
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(
      screen.getByText('kagent has not checked the latest change yet'),
    ).toBeInTheDocument();
    // Not the previous spec's failure.
    expect(screen.queryByText('Agents cannot use this model')).toBeNull();
  });

  it('says nothing for an accepted model', async () => {
    await renderPage();

    expect(screen.queryByText('Agents cannot use this model')).toBeNull();
    expect(screen.queryByText(/kagent has not checked/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Show conditions' }),
    ).toBeNull();
  });

  it('tells a model kagent has not checked yet apart from a failing one', async () => {
    const pending = sonnet();
    pending.jsonData.status = undefined;
    mockUseResource.mockReturnValue({
      resource: pending,
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(
      screen.getByText('kagent has not checked this model yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Agents may not be able to use it until then. Check back in a moment.',
      ),
    ).toBeInTheDocument();
  });

  it('folds Technical details away under the facts for an accepted model, with the resource and its conditions inside', async () => {
    await renderPage();

    expect(
      screen.getByRole('region', { name: 'Model details' }),
    ).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Technical details' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('API key from')).toBeNull();

    await userEvent.click(trigger);

    expect(screen.getByText('API key from')).toBeInTheDocument();
    expect(
      screen.getByText('Secret sonnet-key, key ANTHROPIC_API_KEY'),
    ).toBeInTheDocument();
    // The technical name, under Resource › Name, and only there.
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getAllByText('kagent/sonnet')).toHaveLength(1);
    // Each condition is a heading under the Status card, in the order the
    // controller evaluates them.
    expect(
      screen
        .getAllByRole('heading', { level: 4 })
        .map(heading => heading.textContent),
    ).toEqual([
      expect.stringMatching(/^Accepted/),
      expect.stringMatching(/^ResolvedRefs/),
    ]);
  });

  it('starts Technical details afresh on another model', async () => {
    await renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: 'Technical details' }),
    );
    expect(
      screen.getByRole('button', { name: 'Technical details' }),
    ).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(screen.getByRole('link', { name: 'Next model' }));

    expect(
      screen.getByRole('button', { name: 'Technical details' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it("shows the gateway's figures for the model on Usage, snapshots included", async () => {
    await renderPage(USAGE);

    expect(screen.getByRole('tab', { name: 'Usage' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('$61.30')).toBeInTheDocument();
    expect(screen.getByText('21.9M')).toBeInTheDocument();
    expect(screen.getByText('8,412')).toBeInTheDocument();
    expect(screen.getByTestId('cost-per-day')).toHaveTextContent('Sonnet 4.5');
    // One model, named by the page: no key.
    expect(screen.getByTestId('cost-per-day')).toHaveAttribute(
      'data-legend',
      'false',
    );
    // The agents are Used by's.
    expect(
      screen.queryByRole('grid', { name: 'Agents using this model' }),
    ).toBeNull();
  });

  it('lists the agents whose spec names this model on Used by, linked, with their spend on it', async () => {
    await renderPage(USED_BY);

    expect(screen.getByRole('tab', { name: 'Used by (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const list = screen.getByRole('grid', { name: 'Agents using this model' });
    const items = within(list).getAllByRole('row');
    expect(items.map(item => item.textContent)).toEqual([
      expect.stringContaining('Research Assistant'),
      expect.stringContaining('Support Triage'),
    ]);
    expect(within(items[1]).getByText('$38.40')).toBeInTheDocument();
    // An agent with no calls on the model spent nothing on it.
    expect(within(items[0]).getByText('$0.00')).toBeInTheDocument();
    expect(
      within(list).getByRole('link', { name: 'Support Triage' }),
    ).toHaveAttribute(
      'href',
      '/agent-platform/agents/inst-1/kagent/support-triage',
    );
    expect(screen.queryByText('Copywriter')).toBeNull();
    expect(
      screen.getByText(
        'Each agent shows its spend on this model over the last 30 days.',
      ),
    ).toBeInTheDocument();
    // The figures themselves are the Usage tab's.
    expect(screen.queryByText('Model calls')).toBeNull();
  });

  it('keeps the agents off Overview', async () => {
    await renderPage();

    expect(
      screen.queryByRole('grid', { name: 'Agents using this model' }),
    ).toBeNull();
    expect(screen.queryByText('No agent runs on this model yet.')).toBeNull();
  });

  it('holds the Used by count’s place while the agents load', async () => {
    mockAgents = [];
    mockAgentsLoading = true;
    await renderPage(USED_BY);

    const usedBy = screen.getByRole('tab', { name: 'Used by' });
    expect(usedBy.querySelector('[data-count="loading"]')).not.toBeNull();
    // Still reading: not the claim that none use it.
    expect(screen.queryByText('No agent runs on this model yet.')).toBeNull();
  });

  it('holds the Used by count’s place in the frame drawn while the model loads', async () => {
    mockUseResource.mockReturnValue({
      resource: undefined,
      isLoading: true,
      errors: [],
    });
    await renderPage();

    expect(
      screen
        .getByRole('tab', { name: 'Used by' })
        .querySelector('[data-count="loading"]'),
    ).not.toBeNull();
  });

  it('counts no agents on Used by where they could not be read', async () => {
    mockAgents = [];
    mockUnreachableInstallations = ['inst-1'];
    await renderPage(USED_BY);

    const usedBy = screen.getByRole('tab', { name: 'Used by' });
    // No count, and no placeholder waiting for one.
    expect(usedBy).toHaveTextContent(/^Used by$/);
    expect(usedBy.querySelector('[data-count="loading"]')).toBeNull();
    expect(
      screen.getByText('The agents on inst-1 could not be read.'),
    ).toBeInTheDocument();
  });

  it('lists the agents without spend for a model without a model ID', async () => {
    const unnamed = sonnet();
    (unnamed.jsonData.spec as { model?: string }).model = undefined;
    mockUseResource.mockReturnValue({
      resource: unnamed,
      isLoading: false,
      errors: [],
    });
    await renderPage(USED_BY);

    const list = screen.getByRole('grid', { name: 'Agents using this model' });
    expect(within(list).getAllByRole('row')).toHaveLength(2);
    // Nothing in the gateway's figures can match it: no made-up zeros.
    expect(within(list).queryByText(/\$/)).toBeNull();
    expect(screen.queryByText(/Each agent shows its spend/)).toBeNull();
  });

  it('reads no gateway figures for a model that is not there', async () => {
    mockUseResource.mockReturnValue({
      resource: undefined,
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(screen.getByText('Model not found')).toBeInTheDocument();
    expect(mockLlmUsageInstallations).not.toContain('inst-1');
  });

  it('lists the agents without spend where the gateway has no figures', async () => {
    mockLlmUsage = {
      usage: undefined,
      isLoading: false,
      isError: false,
      isAvailable: false,
    };
    await renderPage(USED_BY);

    const list = screen.getByRole('grid', { name: 'Agents using this model' });
    expect(within(list).getAllByRole('row')).toHaveLength(2);
    expect(within(list).queryByText(/\$/)).toBeNull();
  });

  it('shows the first 10 agents on the model, then all of them on request', async () => {
    mockAgents = Array.from({ length: 14 }, (_, i) =>
      agent(
        `Agent ${String(i + 1).padStart(2, '0')}`,
        `agent-${i + 1}`,
        'inst-1/kagent/sonnet',
      ),
    );
    await renderPage(USED_BY);

    const items = () =>
      within(
        screen.getByRole('grid', { name: 'Agents using this model' }),
      ).getAllByRole('row');
    expect(items()).toHaveLength(10);
    await userEvent.click(
      screen.getByRole('button', { name: 'Show all 14 agents' }),
    );
    expect(items()).toHaveLength(14);
  });

  it('says so when no agent runs on the model, and counts none', async () => {
    mockAgents = [];
    await renderPage(USED_BY);

    expect(
      screen.getByText('No agent runs on this model yet.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Used by (0)' }),
    ).toBeInTheDocument();
  });

  it('states the absence of gateway metrics instead of zeros', async () => {
    mockLlmUsage = {
      usage: undefined,
      isLoading: false,
      isError: false,
      isAvailable: false,
    };
    await renderPage(USAGE);

    expect(
      screen.getByText(
        /need the gateway's metrics, which inst-1 does not publish/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Model calls')).toBeNull();
  });

  it('lists the facts on Overview, the context window where the table names it', async () => {
    mockContextWindows = { 'claude-sonnet-4-5*': 200_000 };
    await renderPage();

    const facts = screen.getByRole('region', { name: 'Model details' });
    expect(within(facts).getByText('Anthropic')).toBeInTheDocument();
    expect(within(facts).getByText('claude-sonnet-4-5')).toBeInTheDocument();
    expect(within(facts).getByText('Provider default')).toBeInTheDocument();
    expect(within(facts).getByText('200k tokens')).toBeInTheDocument();
    expect(within(facts).getByText('inst-1')).toBeInTheDocument();
    // The technical name lives in Technical details › Resource, not here.
    expect(within(facts).queryByText('kagent/sonnet')).toBeNull();
  });

  it('leaves the context window out when the table does not name the model', async () => {
    await renderPage();

    expect(screen.queryByText('Context window')).toBeNull();
  });

  it.each([
    [
      'the former Details tab',
      '/customize/models/inst-1/kagent/sonnet/details',
    ],
    ['any other', '/customize/models/inst-1/kagent/sonnet/facts'],
  ])('lands %s address under the model on Overview', async (_, path) => {
    await renderPage(path);

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('region', { name: 'Model details' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Technical details' }),
    ).toBeInTheDocument();
  });

  it('opens the Connect-a-model flow, prefilled, on Edit', async () => {
    // No form swapped in place any more: Edit goes to the model's edit
    // address, where the create flow reopens with the model's values.
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(
      await screen.findByText('The Connect-a-model flow, prefilled'),
    ).toBeInTheDocument();
  });

  it('keeps Edit in the header on every tab', async () => {
    await renderPage(USED_BY);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('offers no Edit without permission to change the model', async () => {
    mockMayUpdate = false;
    await renderPage();

    expect(
      screen.getByRole('region', { name: 'Model details' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('offers no Edit on a model another tool owns, and says which in the facts', async () => {
    mockUseResource.mockReturnValue({
      resource: sonnet({
        labels: { 'app.kubernetes.io/managed-by': 'Helm' },
      }),
      isLoading: false,
      errors: [],
    });
    await renderPage();

    // A fact, not a banner: the owner, and why there is no Edit.
    const facts = screen.getByRole('region', { name: 'Model details' });
    expect(within(facts).getByText('Managed by')).toBeInTheDocument();
    expect(within(facts).getByText('Helm')).toBeInTheDocument();
    expect(
      within(facts).getByText(
        'Helm would revert edits made here, so change the model where Helm is configured.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Managed by Helm')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('offers no Edit on a provider the form does not speak, and says so', async () => {
    mockUseResource.mockReturnValue({
      resource: new ModelConfig(
        {
          apiVersion: 'api.kagent.dev/v1alpha3',
          kind: 'ModelConfig',
          metadata: { name: 'sonnet', namespace: 'kagent' },
          spec: { provider: 'Bedrock', model: 'claude-sonnet' },
        } as ModelConfigInterface,
        'inst-1',
      ),
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(
      screen.getByText('Provider Bedrock is not editable here'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('at phone width keeps Edit and the tabs, and folds no facts above the content', async () => {
    const layout = mockPhoneLayout();
    try {
      await renderPage();

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(3);
      expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
      expect(
        screen.getByRole('region', { name: 'Model details' }),
      ).toBeInTheDocument();
    } finally {
      layout.restore();
    }
  });
});
