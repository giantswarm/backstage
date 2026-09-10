import type { ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import type {
  AgentHarnessCondition,
  AgentHarnessStatus,
  AgentTemplateInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { agentsRouteRef, modelsRouteRef } from '../../routes';
import { AgentSessionsView } from '../../hooks/useAgentSessions';
import type { ClientServingState } from '../../lib/serving';
import { AgentDetailPage } from './AgentDetailPage';

type AgentInterface = AgentTemplateInterface;

// The real Agent/ModelConfig classes are used to build fixtures — only the fetch
// is mocked — so the page is exercised against the actual getters, readiness
// derivation and provenance helpers rather than a duck-typed stand-in.
const mockUseResource = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

// `GitOpsCard` is deliberately *not* mocked: it reports its Flux lookups through
// `useShowErrors`, which throws without an `ErrorsProvider`, so a stub here would
// hide whether the page actually provides one.

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

// The page calls this on the menu's behalf, because the menu renders in the shared
// header — outside the plugin's QueryClientProvider — and so cannot call it itself.
// Stubbed for the same reason `useAgentSessions` is: this page's react-query client
// is not part of the test, and the menu is not rendered here anyway.
jest.mock('../../hooks/useDeleteAgent', () => ({
  useDeleteAgent: () => ({
    isDeletable: false,
    isCheckingDeletable: false,
    deleteAgent: jest.fn(),
    isDeleting: false,
    error: null,
    reset: jest.fn(),
  }),
}));

// Stubbed for the same reason: it reads `kagentApiRef`, and this page's APIs and
// react-query client are not part of the test. What it drives — the "Start a
// session" button and its dialog — is covered by `NewSessionComposer`'s own tests
// and end to end.
const mockCreateSession = jest.fn();
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: () => ({
    createSession: mockCreateSession,
    isCreating: false,
    error: null,
    reset: jest.fn(),
  }),
}));

// The toolset card reads muster through react-query hooks that need this
// plugin's QueryClientProvider and API, neither of which is part of this page
// test; it is covered by AgentToolsetCard.test.tsx. Here only its presence in
// the page is asserted.
jest.mock('./AgentToolsetCard', () => ({
  AgentToolsetCard: () => <div data-testid="agent-toolset-card" />,
}));

// The serving layer's word on the model behind the agent is driven per case;
// the provider (which would read the fleet) becomes a pass-through.
const mockServingStateFor = jest.fn<
  ClientServingState | undefined,
  unknown[]
>();
jest.mock('../ServingProvider', () => ({
  ServingProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useServing: () => ({
    servingStateFor: (...args: unknown[]) => mockServingStateFor(...args),
  }),
}));

const mockParams: {
  installation: string;
  namespace: string;
  name: string;
} = {
  installation: 'gazelle',
  namespace: 'agent-platform',
  name: 'pr-reviewer',
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockParams,
}));

const { Agent, GitRepository, HelmRelease, Kustomization, ModelConfig } =
  jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react');

const HARNESS_LABEL = 'agent-platform.giantswarm.io/harness';

const READY_CONDITIONS: AgentHarnessCondition[] = [
  {
    type: 'Accepted',
    status: 'True',
    reason: 'Admitted',
    message: 'Template admitted',
    lastTransitionTime: '2026-07-31T10:00:00Z',
  },
  {
    type: 'Ready',
    status: 'True',
    reason: 'RevisionReady',
    message: 'Revision rev-1 is ready',
    lastTransitionTime: '2026-07-31T10:02:00Z',
  },
];

/** One Harness entry of `status.harnesses[]`, the platform Harness by default. */
function harness(
  conditions: AgentHarnessCondition[],
  extra: Partial<AgentHarnessStatus> = {},
): AgentHarnessStatus {
  return {
    harness: 'kagent',
    desiredRevision: 'rev-1',
    latestSuccessfulRevision: 'rev-1',
    ...extra,
    conditions: conditions as AgentHarnessStatus['conditions'],
  };
}

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

function makeAgent(overrides: Partial<AgentInterface> = {}) {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'AgentTemplate',
      metadata: {
        name: 'pr-reviewer',
        namespace: 'agent-platform',
        generation: 1,
        creationTimestamp: '2026-07-21T09:00:00Z',
        annotations: { 'ui.giantswarm.io/display-name': 'PR reviewer' },
        labels: {
          [HARNESS_LABEL]: 'kagent',
          'helm.toolkit.fluxcd.io/name': 'pr-reviewer',
          'helm.toolkit.fluxcd.io/namespace': 'agent-platform',
        },
        ...(overrides.metadata as object),
      },
      spec: {
        description: 'Reviews pull requests in depth.',
        modelConfig: { name: 'opus-4-7' },
        systemPrompt: 'You review pull requests.',
        tools: [
          // The gateway carrier the chart renders, named after the agent.
          { mcp: { server: { kind: 'RemoteMCPServer', name: 'pr-reviewer' } } },
        ],
        skills: [
          {
            name: 'PR review conventions',
            source: {
              git: { url: 'https://github.com/giantswarm/skills', commit: COMMIT },
              path: 'pr-review',
            },
          },
        ],
        ...(overrides.spec as object),
      },
      status: {
        observedGeneration: 1,
        harnesses: [harness(READY_CONDITIONS)],
        ...(overrides.status as object),
      },
    },
    'gazelle',
  );
}

function makeModelConfig() {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: {
        name: 'opus-4-7',
        namespace: 'agent-platform',
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

/**
 * The Flux chain `GitOpsCard` walks to decide whether the agent's desired state is
 * in Git: Agent → HelmRelease → Kustomization → GitRepository. Left empty by
 * default, which is the shape of an agent deployed by this plugin's own flow.
 */
type FluxChain = {
  helmRelease?: unknown;
  kustomization?: unknown;
  gitRepository?: unknown;
};

function stubResources(
  agent?: ResourceOutcome,
  modelConfig?: ResourceOutcome,
  flux: FluxChain = {},
) {
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

  // Matched per resource class, so each hop of the Flux chain resolves to its own
  // fixture rather than to whichever stub happened to be last.
  mockUseResource.mockImplementation(
    (_cluster: string, ResourceClass: unknown) => {
      switch (ResourceClass) {
        case Agent:
          return fill(agent);
        case ModelConfig:
          return fill(modelConfig);
        case HelmRelease:
          return fill({ resource: flux.helmRelease });
        case Kustomization:
          return fill({ resource: flux.kustomization });
        case GitRepository:
          return fill({ resource: flux.gitRepository });
        default:
          return fill();
      }
    },
  );
}

/** A HelmRelease, optionally carrying the Kustomization labels that put it in Git. */
function makeHelmRelease(kustomization?: { name: string; namespace: string }) {
  return new HelmRelease(
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: {
        name: 'pr-reviewer',
        namespace: 'agent-platform',
        ...(kustomization
          ? {
              labels: {
                'kustomize.toolkit.fluxcd.io/name': kustomization.name,
                'kustomize.toolkit.fluxcd.io/namespace':
                  kustomization.namespace,
              },
            }
          : {}),
      },
      spec: {},
    },
    'gazelle',
  );
}

function makeKustomization() {
  return new Kustomization(
    {
      apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
      kind: 'Kustomization',
      metadata: { name: 'agents', namespace: 'flux-giantswarm' },
      spec: {
        path: 'management-clusters/gazelle/extras',
        sourceRef: { kind: 'GitRepository', name: 'management-clusters' },
      },
    },
    'gazelle',
  );
}

function makeGitRepository() {
  return new GitRepository(
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'GitRepository',
      metadata: { name: 'management-clusters', namespace: 'flux-giantswarm' },
      spec: { url: 'https://github.com/giantswarm/management-clusters' },
      status: { artifact: { revision: 'main@sha1:abc123' } },
    },
    'gazelle',
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
    mockServingStateFor.mockReset();
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

    // One skill card: the label, its repo as a link, and the commit it is
    // pinned to — short on the card, full in the tooltip.
    expect(screen.getByText('PR review conventions')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'giantswarm/skills' }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/skills');
    expect(screen.getByText(COMMIT.slice(0, 12))).toHaveAttribute(
      'title',
      COMMIT,
    );
    // Read-only: the picker's checkbox affordance must not come along.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    // The admitting Harness, in the configuration and in the status.
    expect(screen.getByText(/From the label/)).toHaveTextContent(HARNESS_LABEL);
    expect(
      screen.getByRole('list', { name: 'Admitting Harnesses' }),
    ).toHaveTextContent(/kagent.*Ready.*sessions run here/);
  });

  it('shows an OCI skill by its reference and digest', async () => {
    stubResources({
      resource: makeAgent({
        spec: {
          skills: [
            {
              name: 'runbooks',
              source: {
                oci: `gsoci.azurecr.io/giantswarm/skills@sha256:${'f'.repeat(64)}`,
              },
            },
          ],
        },
      } as Partial<AgentInterface>),
    });

    await renderPage();

    expect(screen.getByText('runbooks')).toBeInTheDocument();
    expect(
      screen.getByText('gsoci.azurecr.io/giantswarm/skills'),
    ).toBeInTheDocument();
    expect(screen.getByText(`sha256:${'f'.repeat(12)}`)).toBeInTheDocument();
  });

  it('falls back to the bare ModelConfig reference when it cannot be read', async () => {
    // Normal for a non-admin: ModelConfigs live in namespaces they may not read.
    stubResources({ resource: makeAgent() }, { resource: undefined });

    await renderPage();

    expect(screen.getByText('opus-4-7')).toBeInTheDocument();
  });

  describe('status', () => {
    it('surfaces the Ready condition message for a compiling agent, expanded', async () => {
      stubResources({
        resource: makeAgent({
          status: {
            observedGeneration: 1,
            harnesses: [
              harness(
                [
                  READY_CONDITIONS[0],
                  {
                    type: 'Ready',
                    status: 'False',
                    reason: 'Compiling',
                    message: 'Compiling revision rev-2',
                    lastTransitionTime: '2026-07-31T10:05:00Z',
                  },
                ],
                { desiredRevision: 'rev-2' },
              ),
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Not ready');
      // Visible without a click — the failing condition starts expanded.
      expect(
        screen.getAllByText('Compiling revision rev-2').length,
      ).toBeGreaterThan(0);
      expect(screen.getByText('Compiling')).toBeInTheDocument();
      // The Harness row says which revision it is working on.
      expect(
        screen.getByRole('list', { name: 'Admitting Harnesses' }),
      ).toHaveTextContent(/kagent.*Progressing.*compiling rev-2, last successful rev-1/);
    });

    it('reports a rejected template as not accepted, with the Harness’s reason', async () => {
      stubResources({
        resource: makeAgent({
          status: {
            observedGeneration: 1,
            harnesses: [
              harness([
                READY_CONDITIONS[0],
                {
                  type: 'Compatible',
                  status: 'False',
                  reason: 'Incompatible',
                  message: 'Dedicated sub-agents are not supported by this Harness',
                  lastTransitionTime: '2026-07-31T10:05:00Z',
                },
              ]),
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Not accepted');
      expect(
        screen.getAllByText(
          'Dedicated sub-agents are not supported by this Harness',
        ).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getByRole('list', { name: 'Admitting Harnesses' }),
      ).toHaveTextContent(/kagent.*Failed/);
    });

    // The state of its own: no Harness will ever run this agent until its labels
    // change, so it must not read as a pending that will resolve.
    it('reports a template no Harness admits as not admitted, with the missing label', async () => {
      stubResources({
        resource: makeAgent({
          metadata: {
            name: 'pr-reviewer',
            namespace: 'agent-platform',
            generation: 1,
            labels: {},
          },
          status: { observedGeneration: 1, harnesses: [] },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Not admitted');
      expect(
        screen.getByText(
          `No Harness admits this agent: it carries no ${HARNESS_LABEL} label.`,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/No Harness admits this agent, so none has written/),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('list', { name: 'Admitting Harnesses' }),
      ).not.toBeInTheDocument();
      // The configuration says the label is missing, too.
      expect(screen.getByText(/Not labelled for any Harness/)).toBeInTheDocument();
      // No session can start on it.
      expect(
        screen.queryByRole('button', { name: 'Start a session' }),
      ).not.toBeInTheDocument();
    });

    it('explains a stale status by naming both generations', async () => {
      stubResources({
        resource: makeAgent({
          metadata: {
            name: 'pr-reviewer',
            namespace: 'agent-platform',
            generation: 5,
          },
          status: {
            observedGeneration: 4,
            harnesses: [harness(READY_CONDITIONS)],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Pending');
      expect(screen.getByText(/reconciled generation 4/)).toBeInTheDocument();
      expect(screen.getByText(/generation 5/)).toBeInTheDocument();
    });

    it('explains an agent no Harness has reported on yet', async () => {
      stubResources({
        resource: makeAgent({
          // The controller has not looked at it: no observedGeneration yet.
          status: { observedGeneration: undefined, harnesses: [] },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Pending');
      expect(
        screen.getByText(/No Harness has reported on this agent yet/),
      ).toBeInTheDocument();
    });

    // Independent of readiness, so a ready agent can carry them.
    it('shows the Harness warnings separately from readiness', async () => {
      stubResources({
        resource: makeAgent({
          status: {
            observedGeneration: 1,
            harnesses: [
              harness(READY_CONDITIONS, {
                warnings: ['memory tools are not supported by this Harness'],
              }),
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Ready');
      expect(
        screen.getByText(
          'The Harness could not honour every configured feature',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('memory tools are not supported by this Harness'),
      ).toBeInTheDocument();
    });

    it('lists every admitting Harness, the deciding one first', async () => {
      stubResources({
        resource: makeAgent({
          status: {
            observedGeneration: 1,
            harnesses: [
              harness(READY_CONDITIONS, { harness: 'claude' }),
              harness(
                [
                  READY_CONDITIONS[0],
                  {
                    type: 'Ready',
                    status: 'False',
                    reason: 'Compiling',
                    message: 'compiling',
                    lastTransitionTime: '2026-07-31T10:05:00Z',
                  },
                ],
                { desiredRevision: 'rev-2' },
              ),
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      // The labelled platform Harness decides, even though claude is ready.
      expectHeaderReadiness('Not ready');
      const rows = within(
        screen.getByRole('list', { name: 'Admitting Harnesses' }),
      ).getAllByRole('listitem');
      expect(rows.map(row => row.textContent)).toEqual([
        expect.stringMatching(/^kagent.*Progressing.*sessions run here/),
        expect.stringMatching(/^claude.*Ready/),
      ]);
    });
  });

  describe('tools', () => {
    it('links the muster gateway to the Tool Explorer, installation preselected', async () => {
      stubResources({ resource: makeAgent() });

      await renderPage();

      // Unbound external route in the test app, so assert the reference is named
      // and that a non-gateway server gets no link (below) — the binding itself is
      // muster's to provide. The gateway is the carrier named after the agent.
      expect(
        screen.getByText('RemoteMCPServer pr-reviewer'),
      ).toBeInTheDocument();
      // The gateway row defers to the toolset card rather than claiming "all
      // tools": which of the gateway's tools the agent can use is its toolset.
      expect(screen.getByText(/see Toolset below/)).toBeInTheDocument();
      expect(screen.getByTestId('agent-toolset-card')).toBeInTheDocument();
    });

    it('describes a restricted server by its allowlist', async () => {
      stubResources({
        resource: makeAgent({
          spec: {
            tools: [
              {
                mcp: {
                  server: { kind: 'RemoteMCPServer', name: 'grafana' },
                  tools: ['query', 'dashboards'],
                },
              },
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expect(screen.getByText('RemoteMCPServer grafana')).toBeInTheDocument();
      expect(
        screen.getByText('2 tools: query, dashboards'),
      ).toBeInTheDocument();
    });

    // Two entries may reference the same server with different scopes — that is
    // how "these tools need approval, those don't" is expressed for one server —
    // so `namespace/name` alone is not a usable React key.
    it('renders two entries for the same server without a duplicate key', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      stubResources({
        resource: makeAgent({
          spec: {
            tools: [
              {
                mcp: {
                  server: { kind: 'RemoteMCPServer', name: 'pr-reviewer' },
                  tools: ['list_tools'],
                },
              },
              {
                mcp: {
                  server: { kind: 'RemoteMCPServer', name: 'pr-reviewer' },
                  tools: ['call_tool'],
                  requireApproval: true,
                },
              },
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expect(
        screen.getByText(/1 meta-tool \(list_tools\)/),
      ).toBeInTheDocument();
      expect(screen.getByText(/1 meta-tool \(call_tool\)/)).toBeInTheDocument();
      expect(
        screen.getByText('Requires approval before every call'),
      ).toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalledWith(
        expect.stringContaining('same key'),
        expect.anything(),
        expect.anything(),
      );

      consoleError.mockRestore();
    });

    // Must not imply Muster access the agent does not have.
    it('says so when the agent declares no tool servers', async () => {
      stubResources({
        resource: makeAgent({
          spec: { modelConfig: { name: 'opus-4-7' }, tools: [] },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expect(screen.getByText(/declares no tool servers/)).toBeInTheDocument();
    });

    it('links another template invoked as a tool, by the template behind it', async () => {
      stubResources({
        resource: makeAgent({
          spec: {
            tools: [
              {
                agent: {
                  name: 'escalate',
                  description: 'Escalate to the SRE agent',
                  templateRef: { name: 'sre-agent' },
                },
              },
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expect(
        screen.getByRole('link', { name: 'agent-platform/sre-agent' }),
      ).toHaveAttribute(
        'href',
        '/agent-platform/agents/gazelle/agent-platform/sre-agent',
      );
      expect(screen.getByText(/Called as the tool/)).toHaveTextContent(
        'escalate',
      );
    });
  });

  it('links the owning HelmRelease', async () => {
    stubResources({ resource: makeAgent() });

    await renderPage();

    expect(
      screen.getByText('HelmRelease agent-platform/pr-reviewer'),
    ).toBeInTheDocument();
  });

  describe('GitOps provenance', () => {
    // Renders the real card, so this also covers the ErrorsProvider it needs:
    // without one the page throws rather than rendering anything at all.
    it('claims GitOps, with a source link, when the chain reaches Git', async () => {
      stubResources({ resource: makeAgent() }, undefined, {
        helmRelease: makeHelmRelease({
          name: 'agents',
          namespace: 'flux-giantswarm',
        }),
        kustomization: makeKustomization(),
        gitRepository: makeGitRepository(),
      });

      await renderPage();

      expect(screen.getByText('Managed through GitOps')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute(
        'href',
        expect.stringContaining('management-clusters/gazelle/extras'),
      );
    });

    // The case that matters: an agent created through this plugin is deployed by a
    // HelmRelease the scaffolder applied, so it is Flux-reconciled but its desired
    // state is not in Git. Claiming GitOps there sends the reader looking for a
    // file that does not exist.
    it('makes no GitOps claim when the owning HelmRelease is not in Git', async () => {
      stubResources({ resource: makeAgent() }, undefined, {
        // No Kustomization labels: applied directly, not from a Git source.
        helmRelease: makeHelmRelease(),
      });

      await renderPage();

      expect(
        screen.queryByText('Managed through GitOps'),
      ).not.toBeInTheDocument();
      // The honest statement about where it came from stays.
      expect(
        screen.getByText('HelmRelease agent-platform/pr-reviewer'),
      ).toBeInTheDocument();
    });

    it('makes no GitOps claim for an agent no reconciler owns', async () => {
      stubResources({
        resource: makeAgent({
          // Explicitly empty: applied directly, with no Flux or Helm markers.
          metadata: {
            name: 'pr-reviewer',
            namespace: 'agent-platform',
            labels: {},
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expect(
        screen.queryByText('Managed through GitOps'),
      ).not.toBeInTheDocument();
    });
  });

  it('says an unset system prompt is unset, not empty', async () => {
    stubResources({
      resource: makeAgent({
        spec: { modelConfig: { name: 'opus-4-7' }, systemPrompt: undefined },
      } as Partial<AgentInterface>),
    });

    await renderPage();

    expect(
      screen.getByText('Not set on the AgentTemplate.'),
    ).toBeInTheDocument();
  });

  it('names the ConfigMap a system prompt is read from', async () => {
    stubResources({
      resource: makeAgent({
        spec: {
          modelConfig: { name: 'opus-4-7' },
          systemPrompt: undefined,
          systemPromptFrom: { name: 'prompts', key: 'reviewer.md' },
        },
      } as Partial<AgentInterface>),
    });

    await renderPage();

    expect(
      screen.getByText('Read from the ConfigMap prompts, key reviewer.md.'),
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

    // The page polls every 5 s while an agent converges, and react-query keeps
    // `data` while setting `error` on a failed refetch — so treating `error` as
    // "we have nothing" would let one un-retried 503 blank an agent that is
    // rendered and correct.
    it('keeps the agent rendered when a background poll fails', async () => {
      stubResources({
        resource: makeAgent(),
        error: Object.assign(new Error('service unavailable'), {
          name: 'ServiceUnavailableError',
        }),
        errors: [
          {
            type: 'error',
            cluster: 'gazelle',
            error: Object.assign(new Error('service unavailable'), {
              name: 'ServiceUnavailableError',
            }),
          },
        ],
      });

      await renderPage();

      expect(screen.getByText('PR reviewer')).toBeInTheDocument();
      expect(sectionTitle('Status')).toBeInTheDocument();
      expect(
        screen.queryByText('Could not load this agent'),
      ).not.toBeInTheDocument();
    });

    // Same for a 404 mid-poll: it must not swap a rendered agent for "not found".
    it('keeps the agent rendered when a background poll 404s', async () => {
      stubResources({
        resource: makeAgent(),
        error: Object.assign(new Error('not found'), { name: 'NotFoundError' }),
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

      expect(screen.getByText('PR reviewer')).toBeInTheDocument();
      expect(screen.queryByText('Agent not found')).not.toBeInTheDocument();
    });
  });
});

describe('AgentDetailPage: the model behind the agent', () => {
  // The Serving view lives under the Models tab; mount it too so the Not
  // serving label has somewhere to link.
  const renderPageWithModels = () =>
    renderInTestApp(<AgentDetailPage />, {
      mountedRoutes: {
        '/agent-platform/agents': agentsRouteRef,
        '/agent-platform/models': modelsRouteRef,
      },
    });

  beforeEach(() => {
    mockUseResource.mockReset();
    mockUseAgentSessions.mockReset();
    mockUseAgentSessions.mockReturnValue(NO_SESSIONS);
    mockServingStateFor.mockReset();
  });

  it('asks the serving layer about the agent’s ModelConfig and shows its verdict', async () => {
    mockServingStateFor.mockReturnValue({
      installation: 'gazelle',
      backend: 'ollama',
      readiness: 'idle',
      name: 'qwen3:0.6b',
      message: 'Downloaded; not loaded.',
    });
    stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

    await renderPageWithModels();

    expect(mockServingStateFor).toHaveBeenCalledWith(
      'gazelle',
      expect.objectContaining({
        model: 'claude-opus-4-7',
        modelConfig: { name: 'opus-4-7', namespace: 'agent-platform' },
      }),
    );
    expect(screen.getByTestId('model-serving-readiness')).toHaveTextContent(
      'Idle',
    );
    expect(
      screen.getByText('Served by Ollama model qwen3:0.6b'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Serving view' }),
    ).not.toBeInTheDocument();
  });

  it('links a model nothing serves to the Serving view', async () => {
    mockServingStateFor.mockReturnValue({
      installation: 'gazelle',
      backend: 'kserve',
      readiness: 'notServing',
      name: 'opus',
      namespace: 'model-serving',
      message: 'InferenceService model-serving/opus is not serving.',
    });
    stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

    await renderPageWithModels();

    expect(screen.getByTestId('model-serving-readiness')).toHaveTextContent(
      'Not serving',
    );
    expect(
      screen.getByText('Points at InferenceService model-serving/opus'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Serving view' })).toHaveAttribute(
      'href',
      '/agent-platform/models/serving',
    );
  });

  it('shows nothing about serving for a model the layer has no word on', async () => {
    mockServingStateFor.mockReturnValue(undefined);
    stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

    await renderPageWithModels();

    expect(screen.getByText('Claude Opus 4.7')).toBeInTheDocument();
    expect(
      screen.queryByTestId('model-serving-readiness'),
    ).not.toBeInTheDocument();
  });
});
