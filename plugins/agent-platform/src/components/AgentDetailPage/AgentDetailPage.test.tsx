import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { crds } from '@giantswarm/k8s-types';
import { agentsRouteRef } from '../../routes';
import { AgentSessionsView } from '../../hooks/useAgentSessions';
import { AgentDetailPage } from './AgentDetailPage';

type AgentInterface = crds.kagent.v1alpha2.Agent;

// The real Agent/ModelConfig classes are used to build fixtures — only the fetch
// is mocked — so the page is exercised against the actual getters, readiness
// derivation and provenance helpers rather than a duck-typed stand-in.
const mockUseResource = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

// `GitOpsCard` is deliberately *not* mocked. It reports its Flux lookups through
// `useShowErrors`, which throws without an `ErrorsProvider` — a real crash that a
// stubbed card hid until the page was opened in the browser.

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () =>
    'https://avatars.example/v1/96/pr-reviewer.png',
}));

// Header actions land in the shared plugin header (supplied by GSPageLayout in the
// real app), which is not part of this page's tree. The kebab menu and its manifest
// dialog are covered by AgentActionsMenu.test.tsx instead.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: jest.fn(),
}));

const mockUseAgentSessions = jest.fn<AgentSessionsView, unknown[]>();

jest.mock('../../hooks/useAgentSessions', () => ({
  useAgentSessions: (...args: unknown[]) => mockUseAgentSessions(...args),
}));

const mockParams: {
  installation: string;
  namespace: string;
  name: string;
} = {
  installation: 'gazelle',
  namespace: 'agentic-platform',
  name: 'pr-reviewer',
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockParams,
}));

const { Agent, ModelConfig } = jest.requireActual(
  '@giantswarm/backstage-plugin-kubernetes-react',
);

const READY_CONDITIONS = [
  {
    type: 'Accepted',
    status: 'True',
    reason: 'Reconciled',
    message: 'Agent configuration accepted',
    lastTransitionTime: '2026-07-31T10:00:00Z',
  },
  {
    type: 'Ready',
    status: 'True',
    reason: 'DeploymentReady',
    message: 'Deployment is ready',
    lastTransitionTime: '2026-07-31T10:02:00Z',
  },
];

function makeAgent(overrides: Partial<AgentInterface> = {}) {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'Agent',
      metadata: {
        name: 'pr-reviewer',
        namespace: 'agentic-platform',
        generation: 1,
        creationTimestamp: '2026-07-21T09:00:00Z',
        annotations: { 'ui.giantswarm.io/display-name': 'PR reviewer' },
        labels: {
          'helm.toolkit.fluxcd.io/name': 'pr-reviewer',
          'helm.toolkit.fluxcd.io/namespace': 'agentic-platform',
        },
        ...(overrides.metadata as object),
      },
      spec: {
        type: 'Declarative',
        description: 'Reviews pull requests in depth.',
        declarative: {
          modelConfig: 'opus-4-7',
          systemMessage: 'You review pull requests.',
          tools: [
            {
              type: 'McpServer',
              mcpServer: { name: 'muster', namespace: 'agentic-platform' },
            },
          ],
        },
        skills: {
          gitRefs: [
            {
              url: 'https://github.com/giantswarm/skills',
              path: 'pr-review',
              ref: 'v2.0.0',
              name: 'PR review conventions',
            },
          ],
        },
        ...(overrides.spec as object),
      },
      status: {
        observedGeneration: 1,
        conditions: READY_CONDITIONS,
        ...(overrides.status as object),
      },
    },
    'gazelle',
  );
}

function makeModelConfig() {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'ModelConfig',
      metadata: {
        name: 'opus-4-7',
        namespace: 'agentic-platform',
        annotations: { 'ui.giantswarm.io/display-name': 'Claude Opus 4.7' },
      },
      spec: { model: 'claude-opus-4-7', provider: 'Anthropic' },
    },
    'gazelle',
  );
}

const NO_SESSIONS: AgentSessionsView = {
  rows: [],
  isLoading: false,
  isNotUserScoped: false,
  isUnavailable: false,
};

/** Every `useResource` outcome the page can see, per resource class. */
type ResourceOutcome = {
  resource?: unknown;
  isLoading?: boolean;
  error?: Error | null;
  errors?: unknown[];
};

function stubResources(agent?: ResourceOutcome, modelConfig?: ResourceOutcome) {
  const fill = (outcome: ResourceOutcome = {}) => ({
    resource: outcome.resource,
    isLoading: outcome.isLoading ?? false,
    error: outcome.error ?? null,
    errors: outcome.errors ?? [],
    // Part of `useResource`'s real shape, and read by GitOpsCard.
    incompatibilities: [],
    discoveryErrors: [],
    clientOutdatedStates: [],
  });

  // Matched per resource class, so the Flux chain GitOpsCard walks
  // (HelmRelease → Kustomization → GitRepository) resolves to nothing rather than
  // to whichever stub happened to be last.
  mockUseResource.mockImplementation(
    (_cluster: string, ResourceClass: unknown) => {
      if (ResourceClass === Agent) {
        return fill(agent);
      }
      if (ResourceClass === ModelConfig) {
        return fill(modelConfig);
      }
      return fill();
    },
  );
}

// Only the parent RouteRef is mountable — `mountedRoutes` rejects a SubRouteRef —
// and the detail sub-route resolves relative to it.
const renderPage = () =>
  renderInTestApp(<AgentDetailPage />, {
    mountedRoutes: { '/agent-platform/agents': agentsRouteRef },
  });

/**
 * Assert the *derived* readiness shown in the page header.
 *
 * Queried by test id rather than by text, because the conditions list labels its
 * entries by condition type — so "Ready" legitimately appears twice on the page,
 * once as the derived readiness and once as the condition it came from.
 */
function expectHeaderReadiness(label: string) {
  expect(screen.getByTestId('agent-readiness')).toHaveTextContent(label);
}

/** An InfoCard title, which renders as a heading. */
const sectionTitle = (name: string) => screen.getByRole('heading', { name });

describe('AgentDetailPage', () => {
  beforeEach(() => {
    mockUseResource.mockReset();
    mockUseAgentSessions.mockReset();
    mockUseAgentSessions.mockReturnValue(NO_SESSIONS);
  });

  it('renders every section for a ready agent', async () => {
    stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

    await renderPage();

    // Header
    expect(screen.getByText('PR reviewer')).toBeInTheDocument();
    expectHeaderReadiness('Ready');
    expect(
      screen.getByText('Reviews pull requests in depth.'),
    ).toBeInTheDocument();

    // Sections
    expect(sectionTitle('Status')).toBeInTheDocument();
    expect(sectionTitle('Configuration')).toBeInTheDocument();
    expect(sectionTitle('System prompt')).toBeInTheDocument();
    expect(sectionTitle('Skills (1)')).toBeInTheDocument();
    expect(sectionTitle('Recent sessions')).toBeInTheDocument();

    // Resolved model, from the targeted ModelConfig read
    expect(screen.getByText('Claude Opus 4.7')).toBeInTheDocument();
    expect(screen.getByText('claude-opus-4-7 · Anthropic')).toBeInTheDocument();

    expect(screen.getByText('You review pull requests.')).toBeInTheDocument();
    expect(screen.getByText('PR review conventions')).toBeInTheDocument();
    expect(screen.getByText('at v2.0.0')).toBeInTheDocument();
  });

  it('falls back to the bare ModelConfig reference when it cannot be read', async () => {
    // Normal for a non-admin: ModelConfigs live in namespaces they may not read.
    stubResources({ resource: makeAgent() }, { resource: undefined });

    await renderPage();

    expect(screen.getByText('opus-4-7')).toBeInTheDocument();
  });

  describe('status', () => {
    it('surfaces the Ready condition message for a not-ready agent, expanded', async () => {
      stubResources({
        resource: makeAgent({
          status: {
            observedGeneration: 1,
            conditions: [
              READY_CONDITIONS[0],
              {
                type: 'Ready',
                status: 'False',
                reason: 'DeploymentNotReady',
                message: 'Deployment is not ready, 0/1 pods are ready',
                lastTransitionTime: '2026-07-31T10:05:00Z',
              },
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Not ready');
      // Visible without a click — the failing condition starts expanded.
      expect(
        screen.getAllByText('Deployment is not ready, 0/1 pods are ready')
          .length,
      ).toBeGreaterThan(0);
      expect(screen.getByText('DeploymentNotReady')).toBeInTheDocument();
    });

    it('reports a rejected spec as not accepted, with the reconcile error', async () => {
      stubResources({
        resource: makeAgent({
          status: {
            observedGeneration: 1,
            conditions: [
              {
                type: 'Accepted',
                status: 'False',
                reason: 'ReconcileFailed',
                message: 'modelconfigs.kagent.dev "opus-4-7" not found',
                lastTransitionTime: '2026-07-31T10:05:00Z',
              },
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Not accepted');
      expect(
        screen.getAllByText('modelconfigs.kagent.dev "opus-4-7" not found')
          .length,
      ).toBeGreaterThan(0);
    });

    it('explains a stale status by naming both generations', async () => {
      stubResources({
        resource: makeAgent({
          metadata: {
            name: 'pr-reviewer',
            namespace: 'agentic-platform',
            generation: 5,
          },
          status: { observedGeneration: 4, conditions: READY_CONDITIONS },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Pending');
      expect(screen.getByText(/reconciled generation 4/)).toBeInTheDocument();
      expect(screen.getByText(/generation 5/)).toBeInTheDocument();
    });

    it('explains an agent the controller has not reported on yet', async () => {
      stubResources({
        resource: makeAgent({
          status: { conditions: [] },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expect(
        screen.getByText(/kagent has not reported a status for this agent yet/),
      ).toBeInTheDocument();
    });

    // Abnormal-true: independent of readiness, so a ready agent can carry it.
    it('warns about unsupported features separately from readiness', async () => {
      stubResources({
        resource: makeAgent({
          status: {
            observedGeneration: 1,
            conditions: [
              ...READY_CONDITIONS,
              {
                type: 'UnsupportedFeatures',
                status: 'True',
                reason: 'UnsupportedFeatures',
                message: 'memory is not supported by the go runtime',
                lastTransitionTime: '2026-07-31T10:03:00Z',
              },
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Ready');
      expect(
        screen.getByText('Some configured features are unsupported'),
      ).toBeInTheDocument();
    });
  });

  describe('tools', () => {
    it('links the muster gateway to the Tool Explorer, installation preselected', async () => {
      stubResources({ resource: makeAgent() });

      await renderPage();

      // Unbound external route in the test app, so assert the reference is named
      // and that a non-muster server gets no link (below) — the binding itself is
      // muster's to provide.
      expect(
        screen.getByText('RemoteMCPServer agentic-platform/muster'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('All tools from this server'),
      ).toBeInTheDocument();
    });

    it('describes a restricted server by its allowlist', async () => {
      stubResources({
        resource: makeAgent({
          spec: {
            declarative: {
              tools: [
                {
                  mcpServer: {
                    name: 'grafana',
                    toolNames: ['query', 'dashboards'],
                  },
                },
              ],
            },
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expect(screen.getByText('RemoteMCPServer grafana')).toBeInTheDocument();
      expect(
        screen.getByText('2 tools: query, dashboards'),
      ).toBeInTheDocument();
    });

    // Must not imply Muster access the agent does not have.
    it('says so when the agent declares no tool servers', async () => {
      stubResources({
        resource: makeAgent({
          spec: { declarative: { modelConfig: 'opus-4-7' } },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expect(screen.getByText(/declares no tool servers/)).toBeInTheDocument();
    });
  });

  it('links the owning HelmRelease', async () => {
    stubResources({ resource: makeAgent() });

    await renderPage();

    expect(
      screen.getByText('HelmRelease agentic-platform/pr-reviewer'),
    ).toBeInTheDocument();
  });

  // Renders the real card, so this also guards the ErrorsProvider it needs — the
  // page crashed without one, and a stubbed card would not have noticed.
  it('shows the GitOps card for a reconciled agent', async () => {
    stubResources({ resource: makeAgent() });

    await renderPage();

    expect(screen.getByText('Managed through GitOps')).toBeInTheDocument();
  });

  it('omits the GitOps card for an agent no reconciler owns', async () => {
    stubResources({
      resource: makeAgent({
        // Explicitly empty: applied directly, with no Flux or Helm markers.
        metadata: {
          name: 'pr-reviewer',
          namespace: 'agentic-platform',
          labels: {},
        },
      } as Partial<AgentInterface>),
    });

    await renderPage();

    expect(
      screen.queryByText('Managed through GitOps'),
    ).not.toBeInTheDocument();
  });

  it('says an unset system prompt is unset, not empty', async () => {
    stubResources({
      resource: makeAgent({
        spec: { declarative: { modelConfig: 'opus-4-7' } },
      } as Partial<AgentInterface>),
    });

    await renderPage();

    expect(
      screen.getByText('Not set on the Agent resource.'),
    ).toBeInTheDocument();
  });

  describe('sessions', () => {
    it('describes the list as the user’s own', async () => {
      stubResources({ resource: makeAgent() });

      await renderPage();

      expect(
        screen.getByText(/Your own sessions with this agent/),
      ).toBeInTheDocument();
    });

    // An installation running kagent in `unsecure` mode returns everyone's
    // sessions — calling those "yours" would be a lie in the other direction.
    it('stops claiming the sessions are yours when kagent is not user-scoped', async () => {
      stubResources({ resource: makeAgent() });
      mockUseAgentSessions.mockReturnValue({
        ...NO_SESSIONS,
        isNotUserScoped: true,
      });

      await renderPage();

      expect(
        screen.getByText(/does not scope sessions to a user/),
      ).toBeInTheDocument();
    });

    it('distinguishes unreadable sessions from no sessions', async () => {
      stubResources({ resource: makeAgent() });
      mockUseAgentSessions.mockReturnValue({
        ...NO_SESSIONS,
        isUnavailable: true,
      });

      await renderPage();

      expect(
        screen.getByText('Sessions could not be read from this installation.'),
      ).toBeInTheDocument();
    });
  });

  describe('loading and failure', () => {
    it('shows a progress bar while loading', async () => {
      stubResources({ isLoading: true });

      await renderPage();

      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });

    // Expected outcome — a stale bookmark or a deleted agent — so it gets an
    // explanation rather than an error banner.
    it('explains a missing agent instead of erroring', async () => {
      stubResources({
        error: new Error('not found'),
        errors: [
          {
            type: 'error',
            cluster: 'gazelle',
            error: Object.assign(new Error('not found'), {
              name: 'NotFoundError',
            }),
          },
        ],
      });

      await renderPage();

      expect(screen.getByText('Agent not found')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Back to agents' }),
      ).toBeInTheDocument();
    });

    it('reports any other failure as an error, keeping the way back', async () => {
      stubResources({
        error: new Error('the cluster is on fire'),
        errors: [
          {
            type: 'error',
            cluster: 'gazelle',
            error: new Error('the cluster is on fire'),
          },
        ],
      });

      await renderPage();

      expect(screen.getByText('Could not load this agent')).toBeInTheDocument();
      expect(screen.getByText('the cluster is on fire')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Back to agents' }),
      ).toBeInTheDocument();
    });
  });
});
