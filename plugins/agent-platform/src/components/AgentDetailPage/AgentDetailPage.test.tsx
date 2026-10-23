import type { ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AgentCondition,
  AgentInterface,
  AgentStatus,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  customizeExternalRouteRef,
  agentsRouteRef,
  modelsRouteRef,
  skillsRouteRef,
  usageRouteRef,
} from '../../routes';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { AgentSessionsView } from '../../hooks/useAgentSessions';
import type { AgentStatusState } from '../../hooks/useAgentStatus';
import type { ClientServingState } from '../../lib/serving';
import { AgentDetailPage } from './AgentDetailPage';

// The real Agent/ModelConfig classes are used to build fixtures — only the fetch
// is mocked — so the page is exercised against the actual getters, readiness
// derivation and provenance helpers rather than a duck-typed stand-in.
const mockUseResource = jest.fn();

/** The HelmRelease verbs the person may not use on the agent's release. */
let mockDeniedVerbs = new Set<string>();
afterEach(() => {
  mockDeniedVerbs = new Set();
});
// The sessions here start without a workspace: nothing to name, nothing read.
const mockNoWorkspaceName = () => undefined;
jest.mock('../../hooks/useWorkspaceNames', () => ({
  ...jest.requireActual('../../hooks/useWorkspaceNames'),
  useWorkspaceNames: () => mockNoWorkspaceName,
}));

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: (...args: unknown[]) => mockUseResource(...args),
  useSelfSubjectAccessReview: (
    _cluster: string,
    attributes: { verb: string },
  ) => ({ allowed: !mockDeniedVerbs.has(attributes.verb), isLoading: false }),
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

// The shell's Sessions tab is the Sessions page's list (T46b), whose rows
// carry rename and delete; their writes are that list's own tests' concern.
jest.mock('../../hooks/useDeleteSession', () => ({
  useDeleteSession: () => ({
    deleteSession: jest.fn(),
    isDeleting: false,
    isDeleted: false,
    error: null,
    reset: jest.fn(),
  }),
}));
jest.mock('../../hooks/useRenameSession', () => ({
  useRenameSession: () => ({
    renameSession: jest.fn(),
    isRenaming: false,
    error: null,
    reset: jest.fn(),
  }),
}));
jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilities: () => ({ isUserScoped: true }),
}));

const mockUseAgentSessions = jest.fn<AgentSessionsView, unknown[]>();

jest.mock('../../hooks/useAgentSessions', () => ({
  useAgentSessions: (...args: unknown[]) => mockUseAgentSessions(...args),
}));

// The page calls these on the menu's behalf, because the menu renders in the
// shared header — outside the plugin's QueryClientProvider — and so cannot call
// them itself. Stubbed for the same reason `useAgentSessions` is: this page's
// react-query client and the muster API are not part of the test, and the menu
// and the write dialogs are covered by their own tests.
// The states summary is one more backend read this page's branches do not turn
// on; the table renders the column, and its own tests cover it.
jest.mock('../../hooks/useFleetSessionStates', () => ({
  useFleetSessionStates: () => ({
    states: new Map(),
    unreadable: new Set(),
    failedInstallations: new Set(),
    skippedCount: 0,
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('../../hooks/useAgentDeletion', () => ({
  useAgentDeletion: () => ({
    deleteAgent: jest.fn(),
    isDeleting: false,
    commit: jest.fn(),
    isCommitting: false,
    failure: undefined,
    reset: jest.fn(),
  }),
}));
jest.mock('../../hooks/useUpdateAgent', () => ({
  useUpdateAgent: () => ({
    update: jest.fn(),
    isUpdating: false,
    commit: jest.fn(),
    isCommitting: false,
    failure: undefined,
    reset: jest.fn(),
  }),
}));
// agent-manager's presence on the installation, and what it says about this
// agent. The default is an installation without it — nothing asked, no write
// affordance offered — which is what most of this file's tests want.
let agentManagerPresence: 'available' | 'missing' | 'unknown' = 'unknown';
let isMusterUnavailable = true;
// `get_info`'s `capabilities.commit`: whether agent-manager can open a pull
// request in the repository that owns a release applied from git.
let canCommit = false;

jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerAvailability: () => ({
    available: [],
    missing: [],
    presenceOf: () => agentManagerPresence,
    isLoading: false,
    isUnavailable: isMusterUnavailable,
  }),
  useAgentManagerInfo: () => ({
    info: canCommit ? { capabilities: { commit: true } } : undefined,
    isLoading: false,
    error: null,
  }),
}));

// `get_agent`, which the page reads for one thing only: whether agent-manager
// can write to this agent at all (`managed`). Undefined is the unread case —
// not connected, refused, still in flight — where the actions stay offered.
let managerAgent: { managed: string } | undefined;
let isReadingManagerAgent = false;

jest.mock('../../hooks/useAgentManagerAgent', () => ({
  useAgentManagerAgent: () => ({
    agent: managerAgent,
    isLoading: isReadingManagerAgent,
    failure: undefined,
  }),
}));

/** An installation whose muster lists agent-manager, which is what offers the writes. */
function withAgentManager(managed: string | undefined = 'helmrelease') {
  agentManagerPresence = 'available';
  isMusterUnavailable = false;
  managerAgent = managed === undefined ? undefined : { managed };
  isReadingManagerAgent = false;
}
// agent-manager's `get_agent_status`, the page's word on whether an agent whose
// template the apiserver does not know is being deployed (its HelmRelease exists)
// or does not exist at all. The default is an installation without agent-manager:
// nothing asked, nothing known.
const mockUseAgentStatus = jest.fn<AgentStatusState, unknown[]>();
const NO_STATUS: AgentStatusState = {
  status: undefined,
  isSettling: false,
  isNotFound: false,
  error: null,
};

jest.mock('../../hooks/useAgentStatus', () => ({
  useAgentStatus: (...args: unknown[]) => mockUseAgentStatus(...args),
}));

// Stubbed down to the one thing the page owns: what it does once the write has
// landed. The dialog's own behaviour is covered by AgentUpdateSkillsDialog.test.
const UPDATED_FROM_GENERATION = 4;
jest.mock('./AgentUpdateSkillsDialog', () => ({
  AgentUpdateSkillsDialog: ({
    mode,
    onUpdated,
  }: {
    mode?: string;
    onUpdated: (
      skills: unknown,
      requestedBy?: string,
      fromGeneration?: number,
    ) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() => onUpdated(undefined, 'marian', UPDATED_FROM_GENERATION)}
      >
        stub: Update skills landed
      </button>
      <output aria-label="stub: Update skills mode">{mode}</output>
    </>
  ),
}));

// Stubbed for the same reason: it reads the muster API, and this page's APIs and
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

// The carrier read behind the Overview's toolset line: a namespaced
// RemoteMCPServer list through `useResources`, which the page's fetch stub does
// not cover. Driven per case; the default is the toolset the Agents list would
// summarise as one labelled preset.
const mockUseAgentToolset = jest.fn();
jest.mock('../../hooks/useAgentToolset', () => ({
  useAgentToolset: (...args: unknown[]) => mockUseAgentToolset(...args),
}));
// The catalogue that names individually picked tools by connector (T103);
// `lib/toolsetReach` covers the words.
jest.mock('../../hooks/useReachCatalogue', () => ({
  useReachCatalogue: () => undefined,
}));
const READ_ONLY_TOOLSET = {
  declared: {
    state: 'declared',
    carrier: 'pr-reviewer',
    selectors: ['preset:read-only'],
  },
  isReading: false,
  isUnreadable: false,
};
/** A chat-only agent: no binding reaches the gateway. */
const NO_GATEWAY_TOOLSET = {
  declared: { state: 'no-gateway' },
  isReading: false,
  isUnreadable: false,
};
/** Bound to the gateway, but its carrier declares no tools. */
const NONE_TOOLSET = {
  declared: {
    state: 'declared',
    carrier: 'pr-reviewer',
    selectors: ['preset:none'],
  },
  isReading: false,
  isUnreadable: false,
};

// The shell's plain Overview names skills the way the skill catalog does,
// when it has them. Driven per case; empty by default.
const mockSkillCatalog: { skills: unknown[] } = { skills: [] };
jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => ({
    skills: mockSkillCatalog.skills,
    isLoading: false,
    error: null,
    hasRepositories: true,
    failedRepositories: [],
    truncated: false,
  }),
}));

// The shell's Usage tab reads the Usage screen's two sources — the gateway's
// reduction and kagent's session summary — through their hooks, which are
// covered with the Usage screen; here only what the tab makes of them is.
const mockUseLlmUsage = jest.fn();
jest.mock('../../hooks/useLlmUsage', () => ({
  useLlmUsage: (...args: unknown[]) => mockUseLlmUsage(...args),
}));
const mockUseSessionUsage = jest.fn();
jest.mock('../../hooks/useSessionUsage', () => ({
  useSessionUsage: (...args: unknown[]) => mockUseSessionUsage(...args),
}));
jest.mock('../../lib/formatNumbers', () => ({
  ...jest.requireActual('../../lib/formatNumbers'),
  useCurrency: () => ({ code: 'USD' }),
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('../AgentsDataProvider', () => ({
  ...jest.requireActual('../AgentsDataProvider'),
  AgentsDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
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

/**
 * The agent in the URL. Not a mock: the page is mounted at the real splat route
 * AgentsRouter uses, so these arrive through react-router — which is also what
 * lets the tab strip resolve its base path.
 */
const mockParams: {
  installation: string;
  namespace: string;
  name: string;
} = {
  installation: 'gazelle',
  namespace: 'agent-platform',
  name: 'pr-reviewer',
};

const { Agent, GitRepository, HelmRelease, Kustomization, ModelConfig } =
  jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react');

const READY_CONDITIONS: AgentCondition[] = [
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

/** The verdict the controller wrote, `desiredRevision` defaulting to a compiled-and-current one. */
function reported(
  conditions: AgentCondition[],
  extra: Omit<AgentStatus, 'conditions'> = {},
): AgentStatus {
  return {
    observedGeneration: 1,
    desiredRevision: 'rev-1',
    latestSuccessfulRevision: 'rev-1',
    ...extra,
    conditions,
  };
}

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

function makeAgent(overrides: Partial<AgentInterface> = {}) {
  return new Agent(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: {
        name: 'pr-reviewer',
        namespace: 'agent-platform',
        generation: 1,
        creationTimestamp: '2026-07-21T09:00:00Z',
        annotations: { 'ui.giantswarm.io/display-name': 'PR reviewer' },
        labels: {
          'helm.toolkit.fluxcd.io/name': 'pr-reviewer',
          'helm.toolkit.fluxcd.io/namespace': 'agent-platform',
        },
        ...(overrides.metadata as object),
      },
      spec: {
        harnessRef: { name: 'kagent' },
        template: {
          description: 'Reviews pull requests in depth.',
          modelConfig: { name: 'opus-4-7' },
          systemPrompt: 'You review pull requests.',
          tools: [
            // The gateway carrier the chart renders, named after the agent.
            {
              mcp: { server: { kind: 'RemoteMCPServer', name: 'pr-reviewer' } },
            },
          ],
          skills: [
            {
              name: 'PR review conventions',
              source: {
                git: {
                  url: 'https://github.com/giantswarm/skills',
                  commit: COMMIT,
                },
                path: 'pr-review',
              },
            },
          ],
          ...(overrides.spec as object),
        },
      },
      status: {
        ...reported(READY_CONDITIONS),
        ...(overrides.status as object),
      },
    },
    'gazelle',
  );
}

/** The model the fixture agent references; `displayName: null` omits the annotation. */
function makeModelConfig({
  displayName = 'Claude Opus 4.7',
}: { displayName?: string | null } = {}) {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: {
        name: 'opus-4-7',
        namespace: 'agent-platform',
        annotations: displayName
          ? { 'ui.giantswarm.io/display-name': displayName }
          : undefined,
      },
      spec: { model: 'claude-opus-4-7', provider: 'Anthropic' },
    },
    'gazelle',
  );
}

const NO_SESSIONS: AgentSessionsView = {
  rows: [],
  installation: 'gazelle',
  isLoading: false,
  isNotUserScoped: false,
  isUnavailable: false,
};

const ONE_SESSION: AgentSessionsView = {
  ...NO_SESSIONS,
  rows: [
    {
      id: 'gazelle/abc',
      sessionId: 'abc',
      installation: 'gazelle',
      title: 'Review #2705',
      agentName: 'PR reviewer',
      agentTechnicalName: 'pr-reviewer',
      agentNamespace: 'agent-platform',
      createdAt: '2026-07-23T16:04:28Z',
    },
  ],
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

/**
 * Render the page at one of its tabs — no argument for Overview, which is the
 * index route.
 *
 * Only the parent RouteRef is mountable — `mountedRoutes` rejects a SubRouteRef
 * — and the detail sub-route resolves relative to it. `mountPath` is the splat
 * AgentsRouter mounts this page at, so the page's own `<Routes>` sees the tab
 * segment and `useSplatBasePath` can strip it back off.
 */
const AGENT_PATH = `/customize/agents/${mockParams.installation}/${mockParams.namespace}/${mockParams.name}`;

const renderPage = (tab: string = '') =>
  renderInTestApp(<AgentDetailPage />, {
    mountedRoutes: {
      '/customize/agents': agentsRouteRef,
      '/customize/models': modelsRouteRef,
      '/customize': customizeExternalRouteRef,
      '/customize/skills': skillsRouteRef,
      '/usage': usageRouteRef,
    },
    mountPath: '/customize/agents/:installation/:namespace/:name/*',
    initialRouteEntries: [tab ? `${AGENT_PATH}/${tab}` : AGENT_PATH],
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

/**
 * Opens the Overview's "Technical details" fold-out, where the configuration,
 * status and provenance cards live. It starts open for an agent that is not
 * ready.
 */
async function openTechnicalDetails() {
  const foldOut = screen.getByRole('button', { name: 'Technical details' });
  if (foldOut.getAttribute('aria-expanded') !== 'true') {
    await userEvent.click(foldOut);
  }
}

/** What the configuration's Model row says, beside the facts' own Model. */
function configurationModelRow(): string {
  return Array.from(document.querySelectorAll('dt'))
    .filter(term => term.textContent === 'Model')
    .map(term => term.nextElementSibling?.textContent ?? '')
    .join(' | ');
}

describe('AgentDetailPage', () => {
  beforeEach(() => {
    mockUseResource.mockReset();
    mockUseAgentSessions.mockReset();
    mockUseAgentSessions.mockReturnValue(NO_SESSIONS);
    mockServingStateFor.mockReset();
    mockUseAgentStatus.mockReset();
    mockUseAgentStatus.mockReturnValue(NO_STATUS);
    mockUseAgentToolset.mockReset();
    mockUseAgentToolset.mockReturnValue(READ_ONLY_TOOLSET);
    agentManagerPresence = 'unknown';
    isMusterUnavailable = true;
    managerAgent = undefined;
    isReadingManagerAgent = false;
    canCommit = false;
  });

  it('lists the extra egress origins the Agent declares, and no row without them', async () => {
    const base = makeAgent();
    const withEgress = new Agent(
      {
        ...base.jsonData,
        spec: {
          ...base.jsonData.spec,
          egress: [
            'https://github.com:443',
            'https://*.githubusercontent.com',
            'tls://db.example.com:5432',
          ],
        },
      },
      'gazelle',
    );
    stubResources({ resource: withEgress }, { resource: makeModelConfig() });

    await renderPage();
    await openTechnicalDetails();

    const terms = Array.from(document.querySelectorAll('dt')).map(
      term => term.textContent,
    );
    expect(terms).toContain('Extra egress');
    expect(screen.getByText('https://github.com:443')).toBeInTheDocument();
    expect(
      screen.getByText('https://*.githubusercontent.com'),
    ).toBeInTheDocument();
    expect(screen.getByText('tls://db.example.com:5432')).toBeInTheDocument();
  });

  // Update skills runs from this page and navigates to the URL it is already
  // on, so nothing unmounts. The handoff has to be picked up from the new
  // location rather than only at mount, or the write lands with a toast and no
  // sign of it on the page — and the state stays in the history entry for a
  // later reload to replay.
  describe('after Update skills', () => {
    it('follows the new revision converging, on the same URL', async () => {
      stubResources({ resource: makeAgent() });
      mockUseAgentStatus.mockReturnValue({
        status: undefined,
        isSettling: true,
        isNotFound: false,
        error: null,
      });

      await renderPage();

      // Nothing to follow before the write.
      expect(screen.queryByText('Updating skills…')).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'stub: Update skills landed' }),
      );

      expect(await screen.findByText('Updating skills…')).toBeInTheDocument();
    });

    // The baseline the write captured has to reach the status watch, or it
    // settles on the verdict of the revision that was already there.
    it('watches the revision the write produced, not the one before it', async () => {
      stubResources({ resource: makeAgent() });
      mockUseAgentStatus.mockReturnValue({
        status: undefined,
        isSettling: true,
        isNotFound: false,
        error: null,
      });

      await renderPage();
      await userEvent.click(
        screen.getByRole('button', { name: 'stub: Update skills landed' }),
      );

      await waitFor(() =>
        expect(mockUseAgentStatus).toHaveBeenCalledWith(
          mockParams.installation,
          mockParams.namespace,
          mockParams.name,
          expect.objectContaining({ fromGeneration: UPDATED_FROM_GENERATION }),
        ),
      );
    });
  });

  describe('tools', () => {
    it('renders the toolset under the Tools tab', async () => {
      stubResources({ resource: makeAgent() });

      await renderPage('tools');

      expect(screen.getByTestId('agent-toolset-card')).toBeInTheDocument();
      // The configuration card is Overview's, and does not follow along.
      expect(
        screen.queryByRole('heading', { name: 'Configuration' }),
      ).toBeNull();
    });
  });

  describe('skills', () => {
    // Update skills only moves the pins of skills already mounted, so an agent
    // without any is pointed at the edit page, where skills are added.
    describe('without any', () => {
      const withoutSkills = () =>
        makeAgent({ spec: { skills: [] } } as Partial<AgentInterface>);

      it('offers Add skills to whoever may edit the agent', async () => {
        withAgentManager('helmrelease');
        stubResources({ resource: withoutSkills() });

        await renderPage('skills');

        expect(screen.getByText(/^No skills yet/)).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Add skills' }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('button', {
            name: 'Update all skills to latest…',
          }),
        ).toBeNull();
      });

      it('offers nothing to a viewer who cannot edit the agent', async () => {
        stubResources({ resource: withoutSkills() });

        await renderPage('skills');

        expect(screen.getByText(/^No skills yet/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add skills' })).toBeNull();
      });

      it('says where the skills of an agent applied from git are added', async () => {
        withAgentManager('gitops');
        stubResources({ resource: withoutSkills() });

        await renderPage('skills');

        expect(screen.getByText(/so add skills there/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add skills' })).toBeNull();
      });

      it('offers Add skills for an agent applied from git when agent-manager can commit', async () => {
        // The edit page then opens a pull request in the GitOps repository.
        withAgentManager('gitops');
        canCommit = true;
        stubResources({ resource: withoutSkills() });

        await renderPage('skills');

        expect(
          screen.getByText(/so adding skills opens a pull request there/),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Add skills' }),
        ).toBeInTheDocument();
      });
    });

    // The exact label, because the stubbed dialog's own button says
    // "stub: Update skills landed" and would match a looser query.
    const updateSkills = () =>
      screen.queryByRole('button', { name: 'Update all skills to latest…' });

    it('offers Update skills when agent-manager can write to the agent', async () => {
      withAgentManager('helmrelease');
      stubResources({ resource: makeAgent() });

      await renderPage('skills');

      expect(updateSkills()).toBeInTheDocument();
    });

    it('withholds Update skills for an agent applied from git that agent-manager cannot commit to', async () => {
      // agent-manager refuses every live write to it: its desired state lives in
      // the GitOps repository, so pressing the button could only ever end in the
      // refusal the dialog used to show after the fact.
      withAgentManager('gitops');
      stubResources({ resource: makeAgent() });

      await renderPage('skills');

      expect(updateSkills()).not.toBeInTheDocument();
    });

    it('offers Update skills for an agent applied from git when agent-manager can commit, and opens the dialog in commit mode', async () => {
      // A pull request in the GitOps repository, as Edit and Delete do.
      withAgentManager('gitops');
      canCommit = true;
      stubResources({ resource: makeAgent() });

      await renderPage('skills');

      expect(updateSkills()).toBeInTheDocument();
      await userEvent.click(updateSkills()!);
      expect(
        screen.getByLabelText('stub: Update skills mode'),
      ).toHaveTextContent('commit');
    });

    it('opens the dialog live for an agent agent-manager writes live', async () => {
      withAgentManager('helmrelease');
      canCommit = true;
      stubResources({ resource: makeAgent() });

      await renderPage('skills');

      await userEvent.click(updateSkills()!);
      expect(
        screen.getByLabelText('stub: Update skills mode'),
      ).toHaveTextContent('apply');
    });

    it("withholds Update skills while agent-manager's verdict is in flight", async () => {
      // Not the same as "did not answer": showing the button for a muster
      // round-trip and then removing it is the one window in which a
      // GitOps-owned agent's skills could still be updated.
      withAgentManager('gitops');
      isReadingManagerAgent = true;
      stubResources({ resource: makeAgent() });

      await renderPage('skills');

      expect(updateSkills()).not.toBeInTheDocument();
    });

    it('still offers Update skills when agent-manager did not answer', async () => {
      // Not connected, refused, or still in flight. Withholding the action there
      // would take it from people who do have it; agent-manager refuses on
      // confirm if it must.
      withAgentManager(undefined);
      stubResources({ resource: makeAgent() });

      await renderPage('skills');

      expect(updateSkills()).toBeInTheDocument();
    });
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

    await renderPage('skills');

    expect(screen.getByText('runbooks')).toBeInTheDocument();
    expect(
      screen.getByText(/^From gsoci\.azurecr\.io\/giantswarm\/skills/),
    ).toBeInTheDocument();
  });

  it('names the agent in the document title and as the page heading', async () => {
    stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

    await renderPage();

    // The app layout appends " | <app title>"; the page sets the rest.
    await waitFor(() => expect(document.title).toBe('PR reviewer · Agents'));
    expect(
      screen.getByRole('heading', { level: 1, name: 'PR reviewer' }),
    ).toBeInTheDocument();
  });

  it('titles the page with the technical name when the agent has no display name', async () => {
    stubResources(
      { resource: makeAgent({ metadata: { annotations: {} } }) },
      { resource: makeModelConfig() },
    );

    await renderPage();

    await waitFor(() => expect(document.title).toBe('pr-reviewer · Agents'));
  });

  it('lists the configuration as terms and descriptions, not headings', async () => {
    stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

    await renderPage();
    await openTechnicalDetails();

    const terms = Array.from(document.querySelectorAll('dt')).map(
      term => term.textContent,
    );
    expect(terms).toEqual(expect.arrayContaining(['Model', 'Tools']));
    expect(screen.queryByRole('heading', { name: 'Model' })).toBeNull();
  });

  // A ready agent's conditions all read healthy: one closed disclosure below
  // the Status card's heading, each condition a level below that once opened.
  it('keeps a ready agent’s conditions behind one disclosure', async () => {
    stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

    await renderPage();
    await openTechnicalDetails();

    const disclosure = screen.getByRole('button', { name: 'Conditions (2)' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('heading', { level: 4, name: 'Conditions (2)' }),
    ).toBeInTheDocument();

    await userEvent.click(disclosure);

    expect(
      screen.getByRole('heading', { level: 5, name: /^Accepted/ }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Revision').map(term => term.textContent),
    ).toContain('Revision rev-1');
  });

  it.each([
    ['no', null],
    ['a blank', '  '],
  ])(
    'leads with the model when the ModelConfig has %s display name',
    async (_, displayName) => {
      stubResources(
        { resource: makeAgent() },
        { resource: makeModelConfig({ displayName }) },
      );

      await renderPage();
      await openTechnicalDetails();

      // The configuration card's first line is the model, not the resource
      // name, and in monospace like the other identifiers. (The overview's
      // facts name the ModelConfig too; see the plain Overview's tests.)
      const modelLine = screen
        .getAllByText('claude-opus-4-7 · Anthropic')
        .find(line => line.getAttribute('data-variant') === 'body-medium');
      expect(modelLine).toBeDefined();
      expect(modelLine).toHaveStyle({ fontFamily: 'monospace' });
    },
  );

  it('falls back to the bare ModelConfig reference when it cannot be read', async () => {
    // Normal for a non-admin: ModelConfigs live in namespaces they may not read.
    stubResources({ resource: makeAgent() }, { resource: undefined });

    await renderPage();

    expect(screen.getByText('opus-4-7')).toBeInTheDocument();
    // No link to a page that could only say it cannot load the model.
    await openTechnicalDetails();
    expect(screen.queryByRole('link', { name: /opus-4-7$/ })).toBeNull();
  });

  it("links the ModelConfig in Technical details to the model's page", async () => {
    stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

    await renderPage();
    await openTechnicalDetails();

    expect(
      screen.getByRole('link', { name: 'agent-platform/opus-4-7' }),
    ).toHaveAttribute(
      'href',
      '/customize/models/gazelle/agent-platform/opus-4-7',
    );
    // Sized and coloured as the "ModelConfig" line it sits in.
    expect(
      screen.getByRole('link', { name: 'agent-platform/opus-4-7' }),
    ).toHaveAttribute('data-variant', 'body-small');
  });

  it('keeps the model as text where the agent has no namespace to resolve it in', async () => {
    const agent = makeAgent();
    delete agent.jsonData.metadata!.namespace;
    stubResources({ resource: agent }, { resource: makeModelConfig() });

    await renderPage();
    await openTechnicalDetails();

    // Neither the configuration's ModelConfig nor the facts' model name.
    expect(screen.queryByRole('link', { name: /opus-4-7$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Claude Opus 4.7' })).toBeNull();
    expect(screen.getAllByText('opus-4-7').length).toBeGreaterThan(0);
  });

  describe('status', () => {
    it('surfaces the Ready condition message for a compiling agent, expanded', async () => {
      stubResources({
        resource: makeAgent({
          status: reported(
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
            { observedGeneration: 1, desiredRevision: 'rev-2' },
          ),
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Not ready');
      // Visible without a click — the failing condition starts expanded.
      expect(
        screen.getAllByText('Compiling revision rev-2').length,
      ).toBeGreaterThan(0);
      expect(screen.getByText('Compiling')).toBeInTheDocument();
      // Listed open, not behind the disclosure a ready agent gets.
      expect(
        screen.getByRole('heading', { level: 4, name: /^Ready/ }),
      ).toBeInTheDocument();
      // The one moment the revision explains something.
      expect(
        screen
          .getAllByText(/^Compiling/)
          .some(
            element => element.textContent === 'Compiling rev-2, running rev-1',
          ),
      ).toBe(true);
      // The page says why sessions cannot start yet.
      expect(
        screen.getByText('Sessions can start once the agent is ready'),
      ).toBeInTheDocument();
    });

    it('reports an incompatible template as failed, with the Harness’s reason', async () => {
      stubResources({
        resource: makeAgent({
          status: reported([
            READY_CONDITIONS[0],
            {
              type: 'Compatible',
              status: 'False',
              reason: 'Incompatible',
              message: 'Dedicated sub-agents are not supported by this Harness',
              lastTransitionTime: '2026-07-31T10:05:00Z',
            },
          ]),
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Failed');
      expect(screen.getByText('Sessions cannot start')).toBeInTheDocument();
      expect(
        screen.getAllByText(
          'Dedicated sub-agents are not supported by this Harness',
        ).length,
      ).toBeGreaterThan(0);
      // A configuration problem names no field to mark.
      expect(screen.queryByText('Cannot be resolved')).toBeNull();
    });

    // What kagent writes for a missing ModelConfig: Accepted stays True, the
    // reference check fails, and every later stage reads Blocked — all at one
    // timestamp.
    const unresolvedModelAgent = () =>
      makeAgent({
        status: reported(
          [
            {
              type: 'Accepted',
              status: 'True',
              reason: 'Accepted',
              message: 'Harness "kagent" runs this template',
              lastTransitionTime: '2026-07-31T10:05:00Z',
            },
            {
              type: 'Compatible',
              status: 'False',
              reason: 'Blocked',
              message: 'blocked by ResolvedRefs',
              lastTransitionTime: '2026-07-31T10:05:00Z',
            },
            {
              type: 'Ready',
              status: 'False',
              reason: 'Blocked',
              message: 'blocked by ResolvedRefs',
              lastTransitionTime: '2026-07-31T10:05:00Z',
            },
            {
              type: 'ResolvedRefs',
              status: 'False',
              reason: 'ReferenceResolutionFailed',
              message: 'resolve ModelConfig "qwen3-4b-instruct": not found',
              lastTransitionTime: '2026-07-31T10:05:00Z',
            },
          ],
          { observedGeneration: 1, latestSuccessfulRevision: undefined },
        ),
      } as Partial<AgentInterface>);

    it('leads a failed agent with its root cause and marks the field it is about', async () => {
      stubResources({ resource: unresolvedModelAgent() });

      await renderPage();

      expectHeaderReadiness('Failed');
      expect(screen.getByText('Sessions cannot start')).toBeInTheDocument();
      expect(
        screen.getAllByText(
          'resolve ModelConfig "qwen3-4b-instruct": not found',
        ).length,
      ).toBeGreaterThan(0);

      // The Model row, not the Accepted condition, is where to look.
      expect(configurationModelRow()).toContain('Cannot be resolved');

      // Conditions in the order kagent evaluates them: the failed stage
      // before the stages it blocks, and the one open.
      const headings = screen
        .getAllByRole('heading', { level: 4 })
        .map(heading => heading.textContent ?? '');
      expect(
        headings.filter(text =>
          /^(Accepted|ResolvedRefs|Compatible|Ready)/.test(text),
        ),
      ).toEqual([
        expect.stringMatching(/^Accepted/),
        expect.stringMatching(/^ResolvedRefs/),
        expect.stringMatching(/^Compatible/),
        expect.stringMatching(/^Ready/),
      ]);
      expect(
        screen.getByRole('button', { name: /^ResolvedRefs/ }),
      ).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('button', { name: /^Compatible/ }),
      ).toHaveAttribute('aria-expanded', 'false');
    });

    it('marks the Model row even when the template names no ModelConfig', async () => {
      const { jsonData } = unresolvedModelAgent();
      stubResources({
        resource: new Agent(
          {
            ...jsonData,
            spec: { ...jsonData.spec, modelConfig: undefined },
          } as AgentInterface,
          'gazelle',
        ),
      });

      await renderPage();

      expect(configurationModelRow()).toContain('Cannot be resolved');
    });

    it('offers Edit agent beside the cause to whoever may edit the agent', async () => {
      withAgentManager();
      stubResources({ resource: unresolvedModelAgent() });

      await renderPage();

      expect(
        screen.getByRole('button', { name: 'Edit agent' }),
      ).toBeInTheDocument();
    });

    it('says where a failed agent applied from git is fixed', async () => {
      withAgentManager('gitops');
      stubResources({ resource: unresolvedModelAgent() });

      await renderPage();

      expect(
        screen.getByText(/deployed from GitOps, so fix it there/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit agent' })).toBeNull();
    });

    it('offers Edit agent for a failed agent applied from git when agent-manager can commit', async () => {
      withAgentManager('gitops');
      canCommit = true;
      stubResources({ resource: unresolvedModelAgent() });

      await renderPage();

      expect(
        screen.getByText(
          /deployed from GitOps, so a fix opens a pull request there/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Edit agent' }),
      ).toBeInTheDocument();
    });

    // The Harness is named, but no claim that sessions run on it.
    it('names the Harness of a failed agent without saying sessions run there', async () => {
      stubResources({ resource: unresolvedModelAgent() });

      await renderPage();

      expect(screen.getByText(/^Runs on/)).toHaveTextContent('Runs on kagent');
      expect(screen.queryByText(/Sessions run on/)).toBeNull();
    });

    it('offers no fix to a viewer who cannot edit the agent', async () => {
      stubResources({ resource: unresolvedModelAgent() });

      await renderPage();

      expect(screen.queryByRole('button', { name: 'Edit agent' })).toBeNull();
    });

    it('sends a platform cause to a platform admin rather than to the edit page', async () => {
      withAgentManager();
      stubResources({
        resource: makeAgent({
          status: reported([
            READY_CONDITIONS[0],
            {
              type: 'ResolvedRefs',
              status: 'False',
              reason: 'WorkerPoolNotFound',
              message: 'WorkerPool "kagent/default" not found',
              lastTransitionTime: '2026-07-31T10:05:00Z',
            },
            {
              type: 'Compatible',
              status: 'False',
              reason: 'Blocked',
              message: 'blocked by ResolvedRefs',
              lastTransitionTime: '2026-07-31T10:05:00Z',
            },
          ]),
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expect(
        screen.getByText(
          'WorkerPool "kagent/default" not found. This is a platform problem, not the agent\'s, and a platform admin has to fix it.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit agent' })).toBeNull();
      expect(screen.queryByText('Cannot be resolved')).toBeNull();
    });

    it('explains a stale status by naming both generations', async () => {
      stubResources({
        resource: makeAgent({
          metadata: {
            name: 'pr-reviewer',
            namespace: 'agent-platform',
            generation: 5,
          },
          status: reported(READY_CONDITIONS, { observedGeneration: 4 }),
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
          // The controller has not looked at it: no status yet.
          status: { observedGeneration: undefined, conditions: [] },
        } as Partial<AgentInterface>),
      });

      await renderPage();

      expectHeaderReadiness('Pending');
      expect(
        screen.getByText(/The controller has not reported on this agent yet/),
      ).toBeInTheDocument();
    });

    // Independent of readiness, so a ready agent can carry them.
    it('shows the Harness warnings separately from readiness', async () => {
      stubResources({
        resource: makeAgent({
          status: reported(READY_CONDITIONS, {
            observedGeneration: 1,
            warnings: ['memory tools are not supported by this Harness'],
          }),
        } as Partial<AgentInterface>),
      });

      await renderPage();
      await openTechnicalDetails();

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

    // The read answered and the carrier is not there: not a permission problem.
    it('says the gateway server is missing when the read finds none', async () => {
      mockUseAgentToolset.mockReturnValue({
        declared: { state: 'unresolved', carrier: 'pr-reviewer' },
        isReading: false,
        isUnreadable: false,
      });
      stubResources({ resource: makeAgent() });

      await renderPage();
      await openTechnicalDetails();

      expect(screen.getByText('Gateway server missing')).toBeInTheDocument();
      expect(
        screen.getByText('pr-reviewer does not exist'),
      ).toBeInTheDocument();
    });

    it('waits for the toolset read instead of guessing', async () => {
      mockUseAgentToolset.mockReturnValue({
        declared: { state: 'unresolved', carrier: 'pr-reviewer' },
        isReading: true,
        isUnreadable: false,
      });
      stubResources({ resource: makeAgent() });

      await renderPage();
      await openTechnicalDetails();

      expect(screen.getByText('Reading the toolset…')).toBeInTheDocument();
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
      await openTechnicalDetails();

      expect(screen.getByText('RemoteMCPServer grafana')).toBeInTheDocument();
      expect(
        screen.getAllByText('2 tools: query, dashboards').length,
      ).toBeGreaterThan(0);
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
                  server: { kind: 'RemoteMCPServer', name: 'grafana' },
                  tools: ['query'],
                },
              },
              {
                mcp: {
                  server: { kind: 'RemoteMCPServer', name: 'grafana' },
                  tools: ['annotate'],
                  requireApproval: true,
                },
              },
            ],
          },
        } as Partial<AgentInterface>),
      });

      await renderPage();
      await openTechnicalDetails();

      expect(screen.getAllByText('1 tool: query').length).toBeGreaterThan(0);
      expect(screen.getAllByText('1 tool: annotate').length).toBeGreaterThan(0);
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
      await openTechnicalDetails();

      expect(screen.getByText('No tools')).toBeInTheDocument();
      expect(
        screen.getByText('It relies on its own reasoning alone.'),
      ).toBeInTheDocument();
    });

    it('names a sub-agent by the template behind it', async () => {
      stubResources({
        resource: makeAgent({
          spec: {
            tools: [
              {
                subAgent: {
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
      await openTechnicalDetails();

      expect(screen.getByText('agent-platform/sre-agent')).toBeInTheDocument();
      expect(screen.getByText(/Called as the tool/)).toHaveTextContent(
        'escalate',
      );
    });
  });

  it('links the owning HelmRelease', async () => {
    stubResources({ resource: makeAgent() });

    await renderPage();
    await openTechnicalDetails();

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
      await openTechnicalDetails();

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
      await openTechnicalDetails();

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
      screen.getByText("Nothing is set, so the runtime's defaults apply."),
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
    await openTechnicalDetails();

    expect(
      screen.getByText('ConfigMap prompts, key reviewer.md'),
    ).toBeInTheDocument();
  });

  it('renders the system prompt as Markdown, with a button that copies its source', async () => {
    stubResources({
      resource: makeAgent({
        spec: {
          modelConfig: { name: 'opus-4-7' },
          systemPrompt: '## How you work\n\nLook **before** you answer.',
        },
      } as Partial<AgentInterface>),
    });

    await renderPage();
    await openTechnicalDetails();

    expect(
      screen.getByRole('heading', { name: 'How you work' }),
    ).toBeInTheDocument();
    expect(screen.getByText('before').tagName).toBe('STRONG');
    expect(
      screen.getByRole('button', { name: 'Copy system prompt' }),
    ).toBeInTheDocument();
  });

  describe('sessions', () => {
    // An installation running kagent in `unsecure` mode returns everyone's
    // sessions — calling those "yours" would be a lie in the other direction.
    it('stops claiming the sessions are yours when kagent is not user-scoped', async () => {
      stubResources({ resource: makeAgent() });
      mockUseAgentSessions.mockReturnValue({
        ...ONE_SESSION,
        isNotUserScoped: true,
      });

      await renderPage('sessions');

      expect(
        screen.getByText(/does not scope sessions to users/),
      ).toBeInTheDocument();
    });

    // Nothing to search, sort or page: the table gives way to the next step.
    it('offers to start the first session instead of an empty table', async () => {
      stubResources({ resource: makeAgent() });

      await renderPage('sessions');

      expect(
        screen.getByText('You have no sessions with this agent.'),
      ).toBeInTheDocument();
      // The header's and the empty list's own.
      expect(
        screen.getByRole('button', { name: 'Use this agent' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Start a session' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('searchbox')).toBeNull();
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.queryByText(/not a usage total/)).toBeNull();
    });

    it('offers no session on an agent that cannot run one', async () => {
      stubResources({
        resource: makeAgent({
          status: reported([
            READY_CONDITIONS[0],
            {
              type: 'Compatible',
              status: 'False',
              reason: 'UnsupportedConfiguration',
              message: 'nope',
              lastTransitionTime: '2026-07-31T10:05:00Z',
            },
          ]),
        } as Partial<AgentInterface>),
      });

      await renderPage('sessions');

      expect(
        screen.getByText('You have no sessions with this agent.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Use this agent' }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Start a session' }),
      ).toBeNull();
      // The banner above the tabs says why, on this tab too.
      expect(screen.getByText('Sessions cannot start')).toBeInTheDocument();
    });

    it('distinguishes unreadable sessions from no sessions', async () => {
      stubResources({ resource: makeAgent() });
      mockUseAgentSessions.mockReturnValue({
        ...NO_SESSIONS,
        isUnavailable: true,
      });

      await renderPage('sessions');

      expect(
        screen.getByText('Sessions could not be read from this environment.'),
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

      expect(
        screen.getByRole('heading', { level: 1, name: 'PR reviewer' }),
      ).toBeInTheDocument();
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

      expect(
        screen.getByRole('heading', { level: 1, name: 'PR reviewer' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Agent not found')).not.toBeInTheDocument();
    });
  });

  // Right after Deploy: agent-manager's `create_agent` applied the HelmRelease
  // and the create flow navigated here before helm-controller rendered the
  // Agent, so the Agent read 404s. The page must tell that "not yet"
  // from "not there" — by asking agent-manager, whose `get_agent_status` answers
  // `not_found` only when neither the Agent nor the HelmRelease exists.
  describe('deploying', () => {
    const templateNotFound = () =>
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

    const releaseOnly = (
      overrides: Partial<NonNullable<AgentStatusState['status']>> = {},
    ): AgentStatusState => ({
      status: {
        name: mockParams.name,
        namespace: mockParams.namespace,
        verdict: 'progressing',
        summary: 'HelmRelease created; Flux has not reconciled it yet',
        agent: {
          exists: false,
          ready: null,
          accepted: null,
          resolvedRefs: null,
          compatible: null,
        },
        helmRelease: {
          exists: true,
          ready: null,
          suspended: false,
          gitOpsOwned: false,
          deleting: false,
        },
        ...overrides,
      },
      isSettling: true,
      isNotFound: false,
      error: null,
    });

    /** The interval the page hands the template read, evaluated for "no data". */
    const templatePollInterval = () => {
      const call = mockUseResource.mock.calls.find(
        ([, ResourceClass]) => ResourceClass === Agent,
      );
      const options = call?.[3] as {
        refetchInterval: (query: { state: { data: undefined } }) => number;
      };
      return options.refetchInterval({ state: { data: undefined } });
    };

    it('shows an agent whose HelmRelease exists but whose template is not rendered yet as deploying', async () => {
      templateNotFound();
      mockUseAgentStatus.mockReturnValue(releaseOnly());

      await renderPage();

      expectHeaderReadiness('Deploying');
      expect(screen.getAllByText(mockParams.name)).not.toHaveLength(0);
      expect(
        screen.getByText('HelmRelease created; Flux has not reconciled it yet'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Agent not found')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Use this agent' }),
      ).not.toBeInTheDocument();

      // Asked only because the template read came back empty …
      expect(mockUseAgentStatus).toHaveBeenCalledWith(
        mockParams.installation,
        mockParams.namespace,
        mockParams.name,
        { enabled: true },
      );
      // … and while the release is there, the template is re-read at the fast
      // tier, so the page switches to the rendered agent within one poll of it
      // appearing — not after the 60 s "no data" baseline.
      expect(templatePollInterval()).toBe(5_000);
    });

    it('carries agent-manager’s failure when the release itself does not become ready', async () => {
      templateNotFound();
      mockUseAgentStatus.mockReturnValue(
        releaseOnly({
          verdict: 'failed',
          summary: 'HelmRelease is not ready: install retries exhausted',
        }),
      );

      await renderPage();

      expectHeaderReadiness('Deploying');
      expect(
        screen.getByText('The agent’s release did not become ready'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('HelmRelease is not ready: install retries exhausted'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Agent not found')).not.toBeInTheDocument();
    });

    it('waits for agent-manager’s answer before choosing between deploying and not found', async () => {
      templateNotFound();
      mockUseAgentStatus.mockReturnValue({
        status: undefined,
        isSettling: true,
        isNotFound: false,
        error: null,
      });

      await renderPage();

      expect(screen.getByTestId('progress')).toBeInTheDocument();
      expect(screen.queryByText('Agent not found')).not.toBeInTheDocument();
    });

    it('still says "Agent not found" when neither the template nor the HelmRelease exists', async () => {
      templateNotFound();
      mockUseAgentStatus.mockReturnValue({
        status: undefined,
        isSettling: true,
        isNotFound: true,
        error: null,
      });

      await renderPage();

      expect(screen.getByText('Agent not found')).toBeInTheDocument();
      expect(screen.queryByTestId('agent-readiness')).not.toBeInTheDocument();
      expect(templatePollInterval()).toBe(60_000);
    });

    it('does not ask agent-manager while the agent is in hand', async () => {
      stubResources({ resource: makeAgent() });

      await renderPage();

      expect(mockUseAgentStatus).toHaveBeenCalledWith(
        mockParams.installation,
        mockParams.namespace,
        mockParams.name,
        { enabled: false },
      );
    });
  });
});

describe('AgentDetailPage: the model behind the agent', () => {
  beforeEach(() => {
    mockUseAgentStatus.mockReturnValue(NO_STATUS);
  });

  // The Serving view lives under the Models tab; mount it too so the Not
  // serving label has somewhere to link.
  const renderPageWithModels = () =>
    renderInTestApp(<AgentDetailPage />, {
      mountedRoutes: {
        '/customize/agents': agentsRouteRef,
        '/customize/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
      },
      mountPath: '/customize/agents/:installation/:namespace/:name/*',
      initialRouteEntries: [AGENT_PATH],
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
      message: 'LLMInferenceService model-serving/opus is not serving.',
    });
    stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

    await renderPageWithModels();

    expect(screen.getByTestId('model-serving-readiness')).toHaveTextContent(
      'Not serving',
    );
    expect(
      screen.getByText('Points at LLMInferenceService model-serving/opus'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Serving view' })).toHaveAttribute(
      'href',
      '/customize/models/hosting',
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

describe('AgentDetailPage: the frame and the plain Overview', () => {
  const renderShell = (tab: string = '', path: string = AGENT_PATH) =>
    renderInTestApp(<AgentDetailPage />, {
      mountedRoutes: {
        '/customize/agents': agentsRouteRef,
        '/customize/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
        '/customize/skills': skillsRouteRef,
        '/usage': usageRouteRef,
      },
      mountPath: '/customize/agents/:installation/:namespace/:name/*',
      initialRouteEntries: [tab ? `${path}/${tab}` : path],
    });

  beforeEach(() => {
    mockUseResource.mockReset();
    mockUseAgentSessions.mockReset();
    mockUseAgentSessions.mockReturnValue(NO_SESSIONS);
    mockServingStateFor.mockReset();
    mockUseAgentStatus.mockReset();
    mockUseAgentStatus.mockReturnValue(NO_STATUS);
    mockUseAgentToolset.mockReset();
    mockUseAgentToolset.mockReturnValue(READ_ONLY_TOOLSET);
    mockUseLlmUsage.mockReset();
    mockUseSessionUsage.mockReset();
    mockSkillCatalog.skills = [];
    agentManagerPresence = 'unknown';
    isMusterUnavailable = true;
    managerAgent = undefined;
    isReadingManagerAgent = false;
    canCommit = false;
  });

  describe('the frame', () => {
    it('heads the page with the platform-standard frame, once', async () => {
      stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

      await renderShell();

      // One h1, the agent's name, at the ShellPage scale — no "Agents" page
      // title above a second, agent-sized heading.
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'PR reviewer',
      );
      expectHeaderReadiness('Ready');

      const breadcrumbs = screen.getByRole('navigation', {
        name: 'Breadcrumb',
      });
      expect(
        within(breadcrumbs).getByRole('link', { name: 'Customize' }),
      ).toHaveAttribute('href', '/customize');
      expect(
        within(breadcrumbs).getByRole('link', { name: 'Agents' }),
      ).toHaveAttribute('href', '/customize/agents');
      expect(within(breadcrumbs).getByText('PR reviewer')).toBeInTheDocument();

      // The classic header's back link and identifier are gone from the
      // plain page; the identifier waits behind the technical details.
      expect(screen.queryByText('← Agents')).toBeNull();
      expect(screen.queryByText('agent-platform/pr-reviewer')).toBeNull();
    });

    it('offers Overview, Sessions, Tools and Usage, each at its own URL', async () => {
      stubResources({ resource: makeAgent() });

      await renderShell();

      const tabs = screen.getAllByRole('tab');
      expect(tabs.map(tab => tab.textContent)).toEqual([
        'Overview',
        'Sessions',
        'Tools',
        'Usage',
      ]);
      expect(tabs.map(tab => tab.getAttribute('href'))).toEqual([
        AGENT_PATH,
        `${AGENT_PATH}/sessions`,
        `${AGENT_PATH}/tools`,
        `${AGENT_PATH}/usage`,
      ]);
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
        'Overview',
      );
    });

    it('leaves the Tools tab out for an agent without the gateway', async () => {
      mockUseAgentToolset.mockReturnValue(NO_GATEWAY_TOOLSET);
      stubResources({
        resource: makeAgent({ spec: { tools: [] } } as Partial<AgentInterface>),
      });

      await renderShell();

      expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
        'Overview',
        'Sessions',
        'Usage',
      ]);
    });

    it('leaves the Tools tab out for a gateway-bound agent declaring preset:none', async () => {
      mockUseAgentToolset.mockReturnValue(NONE_TOOLSET);
      stubResources({ resource: makeAgent() });

      await renderShell();

      expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
        'Overview',
        'Sessions',
        'Usage',
      ]);
    });

    it('draws the Tools tab while loading only on a deep link to it', async () => {
      stubResources({ isLoading: true });

      const { unmount } = await renderShell('tools');

      expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
        'Overview',
        'Sessions',
        'Tools',
        'Usage',
      ]);
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
        'Tools',
      );
      unmount();

      await renderShell();

      expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
        'Overview',
        'Sessions',
        'Usage',
      ]);
    });

    it('puts Edit beside "Use this agent", with the rest in the menu', async () => {
      withAgentManager();
      stubResources({ resource: makeAgent() });

      await renderShell();

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Use this agent' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Agent actions' }),
      ).toBeInTheDocument();
    });

    it('offers a user of the agent’s namespace no Edit, and says whose editors may change the agent', async () => {
      withAgentManager();
      mockDeniedVerbs = new Set(['update', 'delete']);
      stubResources({ resource: makeAgent() });

      await renderShell();

      expect(
        await screen.findByText('You can use this agent, not change it'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /agents of namespace agent-platform needs the agent-platform:editor role/,
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Use this agent' }),
      ).toBeInTheDocument();
    });

    it('says which one write the person may not make', async () => {
      withAgentManager();
      mockDeniedVerbs = new Set(['delete']);
      stubResources({ resource: makeAgent() });

      await renderShell();

      expect(
        await screen.findByText('You cannot delete this agent'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('offers no Edit to a viewer who cannot write the agent', async () => {
      stubResources({ resource: makeAgent() });

      await renderShell();

      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Use this agent' }),
      ).toBeInTheDocument();
    });

    it('keeps the frame on a missing agent', async () => {
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

      await renderShell();

      expect(screen.getByText('Agent not found')).toBeInTheDocument();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Agent',
      );
      expect(
        screen.getByRole('navigation', { name: 'Breadcrumb' }),
      ).toBeInTheDocument();
    });
  });

  describe('the plain Overview', () => {
    it('leads with what the agent does, its instructions, skills and reach', async () => {
      stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

      await renderShell();

      expect(
        screen.getByRole('heading', { name: 'What it’s for' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Reviews pull requests in depth.'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Instructions' }),
      ).toBeInTheDocument();
      expect(screen.getByText('You review pull requests.')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Skills' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Connectors' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Can use read-only tools.')).toBeInTheDocument();
      // The exact tools are the Tools tab, not a link from the section.
      expect(
        screen.queryByRole('link', { name: 'See which tools' }),
      ).toBeNull();

      // The Kubernetes-resource cards wait behind the technical details.
      expect(
        screen.queryByRole('heading', { name: 'Configuration' }),
      ).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Status' })).toBeNull();
      expect(screen.queryByText('System prompt')).toBeNull();
    });

    it('shows each skill as a readable card that opens its page', async () => {
      mockSkillCatalog.skills = [
        {
          repoUrl: 'https://github.com/giantswarm/skills',
          path: 'pr-review',
          ref: 'main',
          commit: COMMIT,
          name: 'PR review conventions',
          description: 'How we review pull requests at Giant Swarm.',
        },
      ];
      stubResources({ resource: makeAgent() });

      await renderShell();

      const skills = screen.getByRole('list', { name: 'Skills' });
      expect(
        within(skills).getByRole('link', { name: 'PR review conventions' }),
      ).toHaveAttribute(
        'href',
        '/customize/skills/giantswarm/skills/pr-review',
      );
      expect(
        within(skills).getByText('How we review pull requests at Giant Swarm.'),
      ).toBeInTheDocument();
      expect(
        within(skills).getByText('From giantswarm/skills'),
      ).toBeInTheDocument();
      // The pin is a technical detail.
      expect(within(skills).queryByText(/0123456789ab/)).toBeNull();
      // At the catalog's head: nothing to update.
      expect(within(skills).queryByText('Update available')).toBeNull();
    });

    it("marks a skill pinned behind the catalog's head, from the catalog alone", async () => {
      mockSkillCatalog.skills = [
        {
          repoUrl: 'https://github.com/giantswarm/skills',
          path: 'pr-review',
          ref: 'main',
          commit: 'fedcba9876543210fedcba9876543210fedcba98',
          name: 'PR review conventions',
          description: 'How we review pull requests at Giant Swarm.',
        },
      ];
      stubResources({ resource: makeAgent() });

      await renderShell();

      const skills = screen.getByRole('list', { name: 'Skills' });
      expect(within(skills).getByText('Update available')).toBeInTheDocument();
    });

    it('keeps Update all skills to latest reachable for an agent agent-manager can write', async () => {
      withAgentManager();
      stubResources({ resource: makeAgent() });

      await renderShell();

      expect(
        screen.getByRole('button', { name: 'Update all skills to latest…' }),
      ).toBeInTheDocument();
    });

    it('names the model beside the overview, linked to its page', async () => {
      stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

      await renderShell();

      const facts = screen.getByRole('complementary', {
        name: 'About this agent',
      });
      expect(
        within(facts).getByRole('link', { name: 'Claude Opus 4.7' }),
      ).toHaveAttribute(
        'href',
        '/customize/models/gazelle/agent-platform/opus-4-7',
      );
      // The model it runs, as the secondary line under the name (PO L6).
      expect(
        within(facts).getByText('claude-opus-4-7 · Anthropic'),
      ).toBeInTheDocument();
      expect(within(facts).getByText('gazelle')).toBeInTheDocument();
    });

    it('names the organization of an agent in an organization, under Organization', async () => {
      stubResources(
        {
          resource: makeAgent({
            metadata: { name: 'pr-reviewer', namespace: 'org-acme' },
          }),
        },
        { resource: makeModelConfig() },
      );

      await renderShell(
        '',
        AGENT_PATH.replace('/agent-platform/', '/org-acme/'),
      );

      const facts = screen.getByRole('complementary', {
        name: 'About this agent',
      });
      expect(within(facts).getByText('Organization')).toBeInTheDocument();
      expect(within(facts).queryByText('Tenant')).toBeNull();
      expect(within(facts).getByText('acme')).toBeInTheDocument();
      expect(within(facts).queryByText('organization acme')).toBeNull();
      expect(within(facts).queryByRole('button', { name: /None/ })).toBeNull();
    });

    it('says an agent of the platform belongs to no organization, and is available to all', async () => {
      stubResources(
        {
          resource: makeAgent({
            metadata: { name: 'pr-reviewer', namespace: 'kagent' },
          }),
        },
        { resource: makeModelConfig() },
      );

      await renderShell('', AGENT_PATH.replace('/agent-platform/', '/kagent/'));

      const facts = screen.getByRole('complementary', {
        name: 'About this agent',
      });
      expect(within(facts).getByText('Organization')).toBeInTheDocument();
      expect(within(facts).getByText(/^None/)).toBeInTheDocument();
      expect(within(facts).queryByText(/Platform/)).toBeNull();
      const hint = within(facts).getByRole('button', {
        name: 'What None means',
      });
      // In the tab order; its text is `OrganizationValue`'s own test.
      expect(hint.tabIndex).toBeGreaterThanOrEqual(0);
    });

    it('offers an organization’s user no Edit, and names the organization whose editors may change the agent', async () => {
      withAgentManager();
      mockDeniedVerbs = new Set(['update', 'delete']);
      stubResources({
        resource: makeAgent({
          metadata: { name: 'pr-reviewer', namespace: 'org-acme' },
        }),
      });

      await renderShell(
        '',
        AGENT_PATH.replace('/agent-platform/', '/org-acme/'),
      );

      expect(
        await screen.findByText(
          /Editing and deleting the agents of the acme organization needs the agent-platform:editor role/,
        ),
      ).toBeInTheDocument();
    });

    it('names the agent’s organization and its creator beside the overview', async () => {
      const agent = makeAgent();
      agent.jsonData.metadata.annotations = {
        ...agent.jsonData.metadata.annotations,
        'agent-platform.giantswarm.io/created-by': 'ana@example.com',
      };
      stubResources({ resource: agent }, { resource: makeModelConfig() });

      await renderShell();

      const facts = screen.getByRole('complementary', {
        name: 'About this agent',
      });
      expect(
        within(facts).getByText('namespace agent-platform'),
      ).toBeInTheDocument();
      expect(within(facts).getByText('ana@example.com')).toBeInTheDocument();
    });

    it('keeps the ModelConfig name without a display name, the model below it', async () => {
      stubResources(
        { resource: makeAgent() },
        { resource: makeModelConfig({ displayName: null }) },
      );

      await renderShell();

      const facts = screen.getByRole('complementary', {
        name: 'About this agent',
      });
      // An admin may abstract the model behind the name: the name leads, the
      // model never replaces it.
      expect(
        within(facts).getByRole('link', { name: 'opus-4-7' }),
      ).toBeInTheDocument();
      expect(
        within(facts).getByText('claude-opus-4-7 · Anthropic'),
      ).toBeInTheDocument();
    });

    it('folds the Kubernetes detail into a "Technical details" fold-out, not a switch', async () => {
      stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

      await renderShell();

      // In place, like the create flow's review step — never a page-wide
      // toggle.
      expect(screen.queryByRole('switch')).toBeNull();
      const foldOut = screen.getByRole('button', {
        name: 'Technical details',
      });
      expect(foldOut).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('heading', { name: 'Status' })).toBeNull();

      await userEvent.click(foldOut);

      expect(foldOut).toHaveAttribute('aria-expanded', 'true');

      expect(sectionTitle('Configuration')).toBeInTheDocument();
      expect(sectionTitle('Status')).toBeInTheDocument();
      expect(screen.getAllByText('agent-platform/pr-reviewer').length).toBe(1);
      // Which version of each skill it is pinned to, short with the full pin
      // on hover.
      expect(screen.getByTitle(COMMIT)).toHaveTextContent('0123456789ab');
    });

    it('starts with the technical details open for an agent that is not ready', async () => {
      stubResources({
        resource: makeAgent({
          status: reported(
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
            { observedGeneration: 1, desiredRevision: 'rev-2' },
          ),
        } as Partial<AgentInterface>),
      });

      await renderShell();

      expect(
        screen.getByRole('button', { name: 'Technical details' }),
      ).toHaveAttribute('aria-expanded', 'true');
      expect(sectionTitle('Status')).toBeInTheDocument();
      // Nothing to start a session with yet.
      expect(
        screen.queryByRole('button', { name: 'Use this agent' }),
      ).toBeNull();
    });

    it('sends the retired Skills tab to the Overview that now shows them', async () => {
      stubResources({ resource: makeAgent() });

      await renderShell('skills?installation=gazelle');

      expect(
        screen.getByRole('heading', { name: 'Skills' }),
      ).toBeInTheDocument();
      // The query string survives the redirect: the tabs carry it.
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
        'Overview',
      );
      expect(screen.getByRole('tab', { selected: true })).toHaveAttribute(
        'href',
        `${AGENT_PATH}?installation=gazelle`,
      );
    });

    it('opens the exact tools under the Tools tab', async () => {
      stubResources({ resource: makeAgent() });

      await renderShell('tools');

      expect(screen.getByTestId('agent-toolset-card')).toBeInTheDocument();
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
        'Tools',
      );
      // The agent's trail and title, as on every tab.
      const breadcrumbs = screen.getByRole('navigation', {
        name: 'Breadcrumb',
      });
      expect(within(breadcrumbs).getByText('PR reviewer')).toBeInTheDocument();
      expect(
        within(breadcrumbs).queryByRole('link', { name: 'PR reviewer' }),
      ).toBeNull();
      expect(within(breadcrumbs).queryByText('Tools')).toBeNull();
      await waitFor(() => expect(document.title).toBe('PR reviewer · Agents'));
      // The facts belong to the Overview.
      expect(
        screen.queryByRole('complementary', { name: 'About this agent' }),
      ).toBeNull();
    });

    it('sends the tools of an agent without the gateway to the Overview', async () => {
      mockUseAgentToolset.mockReturnValue(NO_GATEWAY_TOOLSET);
      stubResources({
        resource: makeAgent({ spec: { tools: [] } } as Partial<AgentInterface>),
      });

      await renderShell('tools?installation=gazelle');

      expect(screen.queryByTestId('agent-toolset-card')).toBeNull();
      expect(
        screen.getByRole('heading', { name: 'Connectors' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
        'Overview',
      );
      // The query string survives the redirect, as from `skills`.
      expect(screen.getByRole('tab', { selected: true })).toHaveAttribute(
        'href',
        `${AGENT_PATH}?installation=gazelle`,
      );
    });
  });

  describe('Sessions', () => {
    it('lists your sessions under the tab, without a second heading', async () => {
      mockUseAgentSessions.mockReturnValue(ONE_SESSION);
      stubResources({ resource: makeAgent() });

      await renderShell('sessions');

      expect(
        screen.getByText('These are your sessions with PR reviewer.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Review #2705')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Sessions' })).toBeNull();
    });
  });

  describe('Usage', () => {
    const AGENT_ID = 'agent_platform__NS__pr_reviewer';

    it("shows the agent's slice of the Usage screen", async () => {
      mockUseLlmUsage.mockReturnValue({
        usage: {
          byAgent: [
            {
              id: 'agent-platform|pr-reviewer',
              namespace: 'agent-platform',
              agent: 'pr-reviewer',
              kind: 'agent',
              label: 'PR reviewer',
              tokens: 1_500_000,
              calls: 321,
              costUsd: 12.5,
              sharePct: 40,
            },
          ],
        },
        isLoading: false,
        isError: false,
        isAvailable: true,
      });
      mockUseSessionUsage.mockReturnValue({
        usage: {
          windowDays: 30,
          byAgent: [
            {
              agentId: AGENT_ID,
              sessions: 4,
              turns: 9,
              inputTokens: 1,
              outputTokens: 1,
              costUsd: 1.25,
            },
          ],
        },
        isLoading: false,
        isError: false,
        isNotDeployed: false,
      });
      stubResources({ resource: makeAgent() });

      await renderShell('usage');

      expect(mockUseLlmUsage).toHaveBeenCalledWith('gazelle', { days: 30 });
      expect(screen.getByText('$12.50')).toBeInTheDocument();
      expect(screen.getByText('1.5M')).toBeInTheDocument();
      expect(screen.getByText('321')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('$1.25')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Open in Usage' }),
      ).toHaveAttribute('href', '/usage/cost');
    });

    it('says why the gateway figures are missing, and keeps your own', async () => {
      mockUseLlmUsage.mockReturnValue({
        usage: undefined,
        isLoading: false,
        isError: false,
        isAvailable: false,
      });
      mockUseSessionUsage.mockReturnValue({
        usage: { windowDays: 30, byAgent: [] },
        isLoading: false,
        isError: false,
        isNotDeployed: false,
      });
      stubResources({ resource: makeAgent() });

      await renderShell('usage');

      expect(
        screen.getByText(/need the gateway's metrics, which gazelle/),
      ).toBeInTheDocument();
      expect(screen.queryByText('Spend')).toBeNull();
      expect(screen.getByText('Your sessions')).toBeInTheDocument();
      // No runtime reported a cost, so none is shown — not "$0.00".
      expect(screen.queryByText('Reported cost')).toBeNull();
    });
  });

  describe('at phone width', () => {
    let layout: MockedLayout;
    beforeEach(() => {
      layout = mockPhoneLayout();
    });
    afterEach(() => layout.restore());

    it('puts the facts first, folded under Details, under a header that fits', async () => {
      withAgentManager();
      stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

      await renderShell();

      // Edit, the primary action and the ⋯: no fourth button to wrap.
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Use this agent' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Agent actions' }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(4);

      const details = screen.getByRole('button', { name: 'Details' });
      expect(details).toHaveAttribute('aria-expanded', 'false');
      expect(
        details.compareDocumentPosition(
          screen.getByRole('button', { name: 'Technical details' }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.queryByRole('complementary', { name: 'About this agent' }),
      ).toBeNull();
      await userEvent.click(details);
      expect(
        screen.getByRole('complementary', { name: 'About this agent' }),
      ).toBeInTheDocument();
    });

    it('writes a skill’s pinned commit out whole, where no hover can show it', async () => {
      stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

      await renderShell();
      await userEvent.click(
        screen.getByRole('button', { name: 'Technical details' }),
      );

      const pin = await screen.findByText(COMMIT);
      expect(pin).not.toHaveAttribute('title');
    });
  });

  describe('on a desktop', () => {
    let layout: MockedLayout;
    beforeEach(() => {
      layout = mockDesktopLayout();
    });
    afterEach(() => layout.restore());

    it('shortens a skill’s pinned commit, the whole of it on hover', async () => {
      stubResources({ resource: makeAgent() }, { resource: makeModelConfig() });

      await renderShell();
      await userEvent.click(
        screen.getByRole('button', { name: 'Technical details' }),
      );

      expect(await screen.findByText(COMMIT.slice(0, 12))).toHaveAttribute(
        'title',
        COMMIT,
      );
    });
  });
});
