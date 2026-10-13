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
jest.mock('../../hooks/useLlmUsage', () => ({
  useLlmUsage: () => mockLlmUsage,
}));

// The fleet's agents, as the Customize page's provider lists them.
let mockAgents: AgentRow[] = [];
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => ({
    rows: mockAgents,
    isLoading: false,
    unreachableInstallations: [],
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

function renderPage() {
  return renderInTestApp(
    <PageHeaderActionsProvider>
      <Routes>
        <Route
          path="/customize/models/:installation/:namespace/:name"
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
      initialRouteEntries: ['/customize/models/inst-1/kagent/sonnet'],
      mountedRoutes: {
        '/agent-platform/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
        '/agent-platform/agents': agentsRouteRef,
      },
    },
  );
}

describe('ModelDetailPage', () => {
  beforeEach(() => {
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
    mockAgents = [
      agent('Support Triage', 'support-triage', 'inst-1/kagent/sonnet'),
      agent('Research Assistant', 'researcher', 'inst-1/kagent/sonnet'),
      agent('Copywriter', 'copywriter', 'inst-1/kagent/gpt'),
    ];
  });

  it('opens as a read view with the model as the title and its status', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Sonnet 4.5' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    // No form on this page at all: Edit opens the Connect-a-model flow.
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByLabelText(/Model ID|^Model$/)).toBeNull();
  });

  it('explains a model the controller did not accept in Technical details, open on arrival', async () => {
    const rejected = sonnet();
    rejected.jsonData.status!.conditions![1] = {
      type: 'ResolvedRefs',
      status: 'False',
      reason: 'SecretNotFound',
      message: 'Secret kagent/sonnet-key not found',
      lastTransitionTime: '2026-09-01T10:00:00Z',
    };
    mockUseResource.mockReturnValue({
      resource: rejected,
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(screen.getByText('Not accepted')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Technical details' }),
    ).toHaveAttribute('aria-expanded', 'true');
    // The failing stage starts expanded, its reason and message in view.
    expect(screen.getByText('SecretNotFound')).toBeInTheDocument();
    expect(
      screen.getByText('Secret kagent/sonnet-key not found'),
    ).toBeInTheDocument();
  });

  it('folds Technical details away for an accepted model, with the resource and its conditions inside', async () => {
    await renderPage();

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

  it("shows the gateway's figures for the model, snapshots included", async () => {
    await renderPage();

    expect(screen.getByText('$61.30')).toBeInTheDocument();
    expect(screen.getByText('21.9M')).toBeInTheDocument();
    expect(screen.getByText('8,412')).toBeInTheDocument();
    expect(screen.getByTestId('cost-per-day')).toHaveTextContent('Sonnet 4.5');
    // One model, named by the page: no key.
    expect(screen.getByTestId('cost-per-day')).toHaveAttribute(
      'data-legend',
      'false',
    );
  });

  it('lists the agents whose spec names this model, with their spend on it', async () => {
    await renderPage();

    const list = screen.getByRole('list', { name: 'Agents using this model' });
    const items = within(list).getAllByRole('listitem');
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
  });

  it('shows the first 10 agents on the model, then all of them on request', async () => {
    mockAgents = Array.from({ length: 14 }, (_, i) =>
      agent(
        `Agent ${String(i + 1).padStart(2, '0')}`,
        `agent-${i + 1}`,
        'inst-1/kagent/sonnet',
      ),
    );
    await renderPage();

    const items = () =>
      within(
        screen.getByRole('list', { name: 'Agents using this model' }),
      ).getAllByRole('listitem');
    expect(items()).toHaveLength(10);
    await userEvent.click(
      screen.getByRole('button', { name: 'Show all 14 agents' }),
    );
    expect(items()).toHaveLength(14);
  });

  it('says so when no agent runs on the model', async () => {
    mockAgents = [];
    await renderPage();

    expect(
      screen.getByText('No agent runs on this model yet.'),
    ).toBeInTheDocument();
  });

  it('states the absence of gateway metrics instead of zeros', async () => {
    mockLlmUsage = {
      usage: undefined,
      isLoading: false,
      isError: false,
      isAvailable: false,
    };
    await renderPage();

    expect(
      screen.getByText(
        /need the gateway's metrics, which inst-1 does not publish/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Model calls')).toBeNull();
  });

  it('lists the facts beside the model, the context window where the table names it', async () => {
    mockContextWindows = { 'claude-sonnet-4-5*': 200_000 };
    await renderPage();

    const facts = screen.getByRole('complementary', {
      name: 'About this model',
    });
    expect(within(facts).getByText('claude-sonnet-4-5')).toBeInTheDocument();
    expect(within(facts).getByText('Provider default')).toBeInTheDocument();
    expect(within(facts).getByText('200k tokens')).toBeInTheDocument();
    // The technical name lives in Technical details › Resource, not here.
    expect(within(facts).queryByText('kagent/sonnet')).toBeNull();
  });

  it('leaves the context window out when the table does not name the model', async () => {
    await renderPage();

    expect(screen.queryByText('Context window')).toBeNull();
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

  it('offers no Edit without permission to change the model', async () => {
    mockMayUpdate = false;
    await renderPage();

    expect(screen.getByText('Used by')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('offers no Edit on a model another tool owns, and says which', async () => {
    mockUseResource.mockReturnValue({
      resource: sonnet({
        labels: { 'app.kubernetes.io/managed-by': 'Helm' },
      }),
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(screen.getByText('Managed by Helm')).toBeInTheDocument();
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

  it('at phone width puts the facts first, folded under Details, and keeps Edit and the menu', async () => {
    const layout = mockPhoneLayout();
    try {
      await renderPage();

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      const details = screen.getByRole('button', { name: 'Details' });
      expect(details).toHaveAttribute('aria-expanded', 'false');
      expect(
        details.compareDocumentPosition(
          screen.getByRole('list', { name: 'Agents using this model' }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.queryByRole('complementary', { name: 'About this model' }),
      ).toBeNull();
      await userEvent.click(details);
      expect(
        within(
          screen.getByRole('complementary', { name: 'About this model' }),
        ).getByText('claude-sonnet-4-5'),
      ).toBeInTheDocument();
    } finally {
      layout.restore();
    }
  });
});
