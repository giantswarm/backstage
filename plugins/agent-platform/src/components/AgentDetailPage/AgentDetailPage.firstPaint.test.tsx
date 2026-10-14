import type { ReactNode } from 'react';
import { lazy, Profiler, Suspense } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AgentSessionsView } from '../../hooks/useAgentSessions';
import type { AgentStatusState } from '../../hooks/useAgentStatus';
import {
  agentsRouteRef,
  modelsRouteRef,
  skillsRouteRef,
  usageRouteRef,
} from '../../routes';
import { AgentPlatformCookieAuth } from '../AgentPlatformCookieAuth';
import { AgentPlatformPageRoutes } from '../AgentPlatformPageRoutes';
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

// The agent-platform backend's cookie, which the Agents tab waits for:
// answered when the test says so.
type CookieState =
  { status: 'loading' } | { status: 'success'; data: { expiresAt: string } };
const mockCookieStore = {
  value: { status: 'loading' } as CookieState,
  listeners: new Set<() => void>(),
};
function setCookie(value: CookieState) {
  mockCookieStore.value = value;
  mockCookieStore.listeners.forEach(listener => listener());
}
jest.mock('@backstage/plugin-auth-react', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  const subscribe = (listener: () => void) => {
    mockCookieStore.listeners.add(listener);
    return () => mockCookieStore.listeners.delete(listener);
  };
  return {
    useCookieAuthRefresh: () =>
      useSyncExternalStore(subscribe, () => mockCookieStore.value),
  };
});

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
    // A chat-only agent: no Tools tab, before the read or after it.
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

/**
 * An agent with tools: bound to the gateway's carrier, named after it. A
 * second agent rather than a variant of the first, because the plugin's query
 * client outlives a test and holds the first by its address.
 */
const TOOLS_AGENT_PATH =
  '/agent-platform/agents/gazelle/agent-platform/code-helper';
const TOOLS_AGENT_JSON = {
  ...AGENT_JSON,
  metadata: { ...AGENT_JSON.metadata, name: 'code-helper' },
  spec: {
    ...AGENT_JSON.spec,
    template: {
      ...AGENT_JSON.spec.template,
      tools: [
        { mcp: { server: { kind: 'RemoteMCPServer', name: 'code-helper' } } },
      ],
    },
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
  const agent = [AGENT_JSON, TOOLS_AGENT_JSON].find(({ metadata }) =>
    path.includes(`/agents/${metadata.name}`),
  );
  if (agent) {
    await new Promise<void>(resolve => {
      releaseAgent = resolve;
    });
    return okJson(agent);
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
type Commit = { shape: HeaderShape; h1: Element; paintable: boolean };
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
  commits.push({ shape, h1, paintable: true });
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

/** The h1 elements that could have been on screen, in order, repeats folded. */
function paintedH1s(): Element[] {
  const h1s: Element[] = [];
  for (const { h1, paintable } of commits) {
    if (paintable && h1s[h1s.length - 1] !== h1) {
      h1s.push(h1);
    }
  }
  return h1s;
}

/** Somewhere else in the app, and the ways to the agent from there. */
function Elsewhere() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(AGENT_PATH)}>
        Open the agent
      </button>
      <button
        type="button"
        onClick={() => navigate(`${TOOLS_AGENT_PATH}/tools`)}
      >
        Open an agent's tools
      </button>
    </>
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
      apis: [[kubernetesApiRef, { proxy }]],
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

/**
 * The way the app mounts the agent's page: the Agent Platform page's
 * sub-page routes, the Agents tab's element loaded lazily behind a Suspense
 * boundary (Backstage's `ExtensionBoundary.lazy`), then the cookie the tab
 * waits for, then its router. `releaseChunk` lets the chunk arrive.
 */
async function renderThroughThePage() {
  let releaseChunk: () => void = () => {};
  const chunk = new Promise<void>(resolve => {
    releaseChunk = resolve;
  });
  const AgentsTab = lazy(async () => {
    await chunk;
    return {
      default: () => (
        <AgentPlatformCookieAuth>
          <QueryClientProvider>
            <Routes>
              <Route
                path=":installation/:namespace/:name/*"
                element={<AgentDetailPage />}
              />
            </Routes>
          </QueryClientProvider>
        </AgentPlatformCookieAuth>
      ),
    };
  });
  await renderInTestApp(
    <Profiler id="agent-platform-page" onRender={recordCommit}>
      <Routes>
        <Route path="/elsewhere" element={<Elsewhere />} />
        <Route
          path="/agent-platform/*"
          element={
            <AgentPlatformPageRoutes
              pageTitle="Agent Platform"
              pages={[
                {
                  path: 'agents',
                  title: 'Agents',
                  element: (
                    <Suspense fallback={<div data-testid="chunk-loading" />}>
                      <AgentsTab />
                    </Suspense>
                  ),
                },
              ]}
            />
          }
        />
      </Routes>
    </Profiler>,
    {
      apis: [[kubernetesApiRef, { proxy }]],
      mountedRoutes: {
        '/agent-platform/agents': agentsRouteRef,
        '/agent-platform/models': modelsRouteRef,
        '/agent-platform/skills': skillsRouteRef,
        '/agent-platform/usage': usageRouteRef,
      },
      initialRouteEntries: ['/elsewhere'],
    },
  );
  return { releaseChunk: () => releaseChunk() };
}

/**
 * The final header: avatar, title, badge row, the tabs, the trail. Three tabs
 * for the chat-only agent; four on a deep link to the Tools tab.
 */
const FINAL_FRAME = {
  leading: true,
  badgeRow: true,
  tabs: 3,
  breadcrumbs: true,
};

function expectEveryPaintInFinalFrame(tabs = FINAL_FRAME.tabs) {
  const shapes = paintedShapes();
  expect(shapes.length).toBeGreaterThan(0);
  for (const shape of shapes) {
    expect({ shape, frame: shape }).toEqual({
      shape,
      frame: expect.objectContaining({ ...FINAL_FRAME, tabs }),
    });
  }
}

beforeEach(() => {
  window.localStorage.clear();
  commits = [];
  proxy.mockClear();
  mockCookieStore.value = { status: 'loading' };
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
    // The skeleton title and the name are the one h1 element: the same type
    // scale, the same place after the avatar.
    expect(paintedH1s()).toHaveLength(1);
  });

  it('keeps a deep link to the Tools tab on its tab while the agent is read', async () => {
    await renderApp();
    await userEvent.click(
      screen.getByRole('button', { name: "Open an agent's tools" }),
    );

    expect(await screen.findByTestId('progress')).toBeInTheDocument();
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Tools',
    );

    await act(async () => releaseAgent());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'PR reviewer' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Tools',
    );

    // Four tabs from the first paint to the read agent.
    expectEveryPaintInFinalFrame(4);
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

  it('shows no other page’s header while the route’s code and cookie load', async () => {
    const { releaseChunk } = await renderThroughThePage();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open the agent' }),
    );

    // The tab's code is still loading: nothing but the empty content area —
    // in particular not the section's "Agents" header.
    expect(screen.getByTestId('chunk-loading')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();

    // The code is there, the cookie is not: still nothing.
    await act(async () => releaseChunk());
    expect(screen.queryByTestId('chunk-loading')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();

    // The cookie arrives: the agent's own frame is the first h1 painted.
    act(() =>
      setCookie({
        status: 'success',
        data: { expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
      }),
    );
    await act(async () => releaseAgent());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'PR reviewer' }),
    ).toBeInTheDocument();

    expect(paintedShapes().map(shape => shape.title)).not.toContain('Agents');
    expectEveryPaintInFinalFrame();
  });
});
