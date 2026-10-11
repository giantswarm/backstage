import type { ReactNode } from 'react';
import { Profiler } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AGENT_SHELL_FLAG } from '../../hooks/useAgentShell';
import type { AgentSessionsView } from '../../hooks/useAgentSessions';
import type { AgentStatusState } from '../../hooks/useAgentStatus';
import {
  agentsRouteRef,
  modelsRouteRef,
  skillsRouteRef,
  usageRouteRef,
} from '../../routes';
import { QueryClientProvider } from '../QueryClientProvider';
import { AgentDetailPage } from './AgentDetailPage';

/*
 * T95: opening an agent from the overview must paint the page's final header
 * from the first commit — avatar, title line, badge row, tabs — and only fill
 * in what was not known yet. Driven through the real `useResource` and the
 * plugin's real persisted query client, whose restore on every provider mount
 * is one of the two windows the page used to answer with a different, bare
 * header. Every React commit is recorded (Profiler), because a flash is
 * exactly what a final-state assertion misses.
 */

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () =>
    'https://avatars.example/v1/96/pr-reviewer.png',
}));

const NO_SESSIONS: AgentSessionsView = {
  rows: [],
  installation: 'gazelle',
  isLoading: false,
  isNotUserScoped: false,
  isUnavailable: false,
};
jest.mock('../../hooks/useAgentSessions', () => ({
  useAgentSessions: () => NO_SESSIONS,
}));

const NO_STATUS: AgentStatusState = {
  status: undefined,
  isSettling: false,
  isNotFound: false,
  error: null,
};
jest.mock('../../hooks/useAgentStatus', () => ({
  useAgentStatus: () => NO_STATUS,
}));

jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerAvailability: () => ({
    available: [],
    missing: [],
    presenceOf: () => 'unknown',
    isLoading: false,
    isUnavailable: true,
  }),
  useAgentManagerInfo: () => ({
    info: undefined,
    isLoading: false,
    error: null,
  }),
}));
jest.mock('../../hooks/useAgentManagerAgent', () => ({
  useAgentManagerAgent: () => ({
    agent: undefined,
    isLoading: false,
    failure: undefined,
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
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: () => ({
    createSession: jest.fn(),
    isCreating: false,
    error: null,
    reset: jest.fn(),
  }),
}));
jest.mock('../ServingProvider', () => ({
  ServingProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useServing: () => ({ servingStateFor: () => undefined }),
}));

// The frame is under test, not what fills it: the tab content and the dialogs
// read APIs of their own, covered by AgentDetailPage.test.tsx.
jest.mock('./AgentPlainOverview', () => ({
  ...jest.requireActual('./AgentPlainOverview'),
  AgentPlainOverview: () => <div data-testid="agent-overview" />,
}));
jest.mock('../NewSessionDialog', () => ({ NewSessionDialog: () => null }));
jest.mock('./AgentDeleteDialog', () => ({
  ...jest.requireActual('./AgentDeleteDialog'),
  AgentDeleteDialog: () => null,
}));
jest.mock('./AgentUpdateSkillsDialog', () => ({
  AgentUpdateSkillsDialog: () => null,
}));

const AGENT_PATH = '/agent-platform/agents/gazelle/agent-platform/pr-reviewer';

const AGENT_JSON = {
  apiVersion: 'api.kagent.dev/v1alpha3',
  kind: 'Agent',
  metadata: {
    name: 'pr-reviewer',
    namespace: 'agent-platform',
    generation: 1,
    creationTimestamp: '2026-07-21T09:00:00Z',
    annotations: { 'ui.giantswarm.io/display-name': 'PR reviewer' },
  },
  spec: {
    harnessRef: { name: 'kagent' },
    template: { description: 'Reviews pull requests in depth.' },
  },
  status: {
    observedGeneration: 1,
    desiredRevision: 'rev-1',
    latestSuccessfulRevision: 'rev-1',
    conditions: [
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
    ],
  },
};

function notFound() {
  return {
    ok: false,
    status: 404,
    statusText: 'Not Found',
    headers: new Map(),
    json: async () => ({ kind: 'Status', reason: 'NotFound', code: 404 }),
    text: async () => '{"kind":"Status","reason":"NotFound","code":404}',
    // The page only touches ok/status/json/text; the rest of Response is unused.
  } as unknown as Response;
}

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** The Agent read, held open until the test lets it answer. */
let releaseAgent: () => void = () => {};
const proxy = jest.fn(async ({ path }: { path: string }) => {
  if (path.includes('/agents/pr-reviewer')) {
    await new Promise<void>(resolve => {
      releaseAgent = resolve;
    });
    return okJson(AGENT_JSON);
  }
  return notFound();
});

/** What the header looked like at one commit — its structure, which is its geometry. */
type HeaderShape = {
  title: string;
  leading: boolean;
  badgeRow: boolean;
  tabs: number;
  breadcrumbs: boolean;
  loading: boolean;
};

/**
 * Every commit, and whether a browser could have painted it. One that a
 * later commit replaced before the end of its own task — before even the
 * microtask it queued ran — never reaches the screen: react-aria's tabs are
 * such a case, drawn by a synchronous second render (from a layout effect)
 * after the strip mounts. Everything else counts, conservatively.
 */
type Commit = { shape: HeaderShape; paintable: boolean };
let commits: Commit[] = [];
let inCommitTask = false;

function recordCommit() {
  const h1 = document.querySelector('h1');
  if (!h1) {
    return;
  }
  const titles = h1.parentElement!;
  const identity = titles.parentElement!;
  const shape: HeaderShape = {
    title: h1.textContent ?? '',
    leading: identity.firstElementChild !== titles,
    badgeRow: titles.children.length > 1,
    tabs: document.querySelectorAll('[role="tab"]').length,
    breadcrumbs: Boolean(
      document.querySelector('nav[aria-label="Breadcrumb"]'),
    ),
    loading: Boolean(document.querySelector('[data-testid="progress"]')),
  };
  const previous = commits[commits.length - 1];
  if (previous && inCommitTask) {
    previous.paintable = false;
  }
  commits.push({ shape, paintable: true });
  inCommitTask = true;
  queueMicrotask(() => {
    inCommitTask = false;
  });
}

/** The header as it could have been on screen, consecutive repeats folded. */
function paintedShapes(): HeaderShape[] {
  const shapes: HeaderShape[] = [];
  for (const { shape, paintable } of commits) {
    const last = shapes[shapes.length - 1];
    if (
      paintable &&
      (!last || JSON.stringify(last) !== JSON.stringify(shape))
    ) {
      shapes.push(shape);
    }
  }
  return shapes;
}

/** Somewhere else in the app, and the way to the agent from there. */
function Elsewhere() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(AGENT_PATH)}>
      Open the agent
    </button>
  );
}

function Leave() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/elsewhere')}>
      Leave
    </button>
  );
}

/**
 * The overview and the agent's page under separate mounts of the plugin's
 * query provider, as in the app — so opening the agent mounts its provider
 * afresh and restores the persisted cache.
 */
async function renderApp() {
  await renderInTestApp(
    <Profiler id="agent-detail" onRender={recordCommit}>
      <Routes>
        <Route path="/elsewhere" element={<Elsewhere />} />
        <Route
          path="/agent-platform/agents/:installation/:namespace/:name/*"
          element={
            <QueryClientProvider key="agents">
              <Leave />
              <AgentDetailPage />
            </QueryClientProvider>
          }
        />
      </Routes>
    </Profiler>,
    {
      apis: [
        mockApis.featureFlags({
          initialStates: { [AGENT_SHELL_FLAG]: FeatureFlagState.Active },
        }),
        [kubernetesApiRef, { proxy }],
      ],
      mountedRoutes: {
        '/agent-platform/agents': agentsRouteRef,
        '/agent-platform/models': modelsRouteRef,
        '/agent-platform/skills': skillsRouteRef,
        '/agent-platform/usage': usageRouteRef,
      },
      initialRouteEntries: ['/elsewhere'],
    },
  );
}

/** The final header: avatar, title, badge row, the three tabs, the trail. */
const FINAL_FRAME = {
  leading: true,
  badgeRow: true,
  tabs: 3,
  breadcrumbs: true,
};

function expectEveryPaintInFinalFrame() {
  const shapes = paintedShapes();
  expect(shapes.length).toBeGreaterThan(0);
  for (const shape of shapes) {
    expect({ shape, frame: shape }).toEqual({
      shape,
      frame: expect.objectContaining(FINAL_FRAME),
    });
  }
}

beforeEach(() => {
  window.localStorage.clear();
  commits = [];
  proxy.mockClear();
});

describe('AgentDetailPage — the first paint', () => {
  it('paints the final header while the agent is read for the first time', async () => {
    await renderApp();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open the agent' }),
    );

    // The read is in flight: the page is loading, in the final frame.
    expect(await screen.findByTestId('progress')).toBeInTheDocument();
    expect(paintedShapes().some(shape => shape.loading)).toBe(true);

    await act(async () => releaseAgent());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'PR reviewer' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('agent-readiness')).toHaveTextContent('Ready');

    expectEveryPaintInFinalFrame();
  });

  it('opens an agent read before straight at its page, not a loading frame', async () => {
    // First visit, so the shared query client holds the agent in memory.
    await renderApp();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open the agent' }),
    );
    await act(async () => releaseAgent());
    await screen.findByRole('heading', { level: 1, name: 'PR reviewer' });

    // Away and back: the agent's provider mounts afresh and restores the
    // persisted cache, while the agent is already in hand.
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    commits = [];
    await userEvent.click(
      screen.getByRole('button', { name: 'Open the agent' }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'PR reviewer' }),
    ).toBeInTheDocument();

    expectEveryPaintInFinalFrame();
    // Nothing but the agent itself, from the first commit.
    expect(paintedShapes().map(shape => shape.title)).toEqual(['PR reviewer']);
    expect(paintedShapes().some(shape => shape.loading)).toBe(false);
  });
});
