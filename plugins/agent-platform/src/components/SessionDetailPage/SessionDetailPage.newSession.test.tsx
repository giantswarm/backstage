import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler } from 'react';
import { Route, Routes } from 'react-router-dom';
import {
  normalizeSessionDetail,
  normalizeTaskList,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  sessionDetailV099,
  tasksV099,
} from '@giantswarm/backstage-plugin-agent-platform-common/testFixtures';

import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { kagentApiRef } from '../../apis';
import type { KagentApi } from '../../apis/types';
import { agentsRouteRef, sessionsRouteRef } from '../../routes';
import type { AgentRow, AgentsContextValue } from '../AgentsDataProvider';
import { QueryClientProvider } from '../QueryClientProvider';
import { SessionDetailRoute } from '../SessionsRouter/SessionDetailRoute';
import { StartNewSession } from '../StartNewSession';

/*
 * T86: starting a session from a composer lands on the session's page, and
 * between the create and the first rendered conversation the person must see
 * the page loading — never an error the next read takes back. The flow is
 * driven end to end here, through the real query client and its persistence
 * (whose restore on mount is one of the two windows that flashed an error),
 * with agent-manager (behind muster) and kagent as the only fakes.
 */

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => 'https://avatars.example/agent.png',
}));

// Mimir, through the gs plugin's API: not what this test is about.
jest.mock('../../hooks/useTokenRates', () => ({
  useTokenRates: () => ({
    rates: {},
    tier: 'none',
    model: undefined,
    isLoading: false,
    isAvailable: true,
    window: '7d',
  }),
}));
jest.mock('../../hooks/useSessionEgressRefusals', () => ({
  useSessionEgressRefusals: () => [],
}));

jest.mock('../../hooks/useMusterServers', () => ({
  useMusterServers: () => ({
    servers: [],
    resources: [],
    labels: new Map(),
    isLoading: false,
    isUnavailable: false,
  }),
}));

// The agent's model is no ChatGPT login here; that gate has its own tests.
jest.mock('../../hooks/useChatGptConnection', () => ({
  useChatGptConnection: () => ({
    isPersonalModel: false,
    blocksTurn: false,
    isLoading: false,
  }),
}));

jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilities: () => ({ isUserScoped: true }),
}));

const agent: AgentRow = {
  id: 'gazelle/kagent/issue-tracker',
  installation: 'gazelle',
  namespace: 'kagent',
  name: 'Issue tracker',
  technicalName: 'issue-tracker',
  description: 'Tracks issues',
  skillCount: 0,
  readiness: 'ready',
};

const agents: AgentsContextValue = {
  rows: [agent],
  scope: 'all',
  installations: ['gazelle'],
  isLoading: false,
  isLoadingMore: false,
  hasInstallations: true,
  unreachableInstallations: [],
  noAccessInstallations: [],
  kagentMissing: undefined,
  kagentSwitchedOff: [],
  unknownPin: undefined,
  inventoryFailure: undefined,
  retry: async () => {},
};

jest.mock('../AgentsDataProvider', () => ({
  ...jest.requireActual('../AgentsDataProvider'),
  useAgents: () => agents,
}));

const detail = normalizeSessionDetail(sessionDetailV099, 'gazelle').detail!;
const tasks = normalizeTaskList(tasksV099).tasks;

/** What either read can say when it is not the answer. */
const ERROR_TEXTS = [
  'Session not found',
  'Could not load this session',
  'This session may be out of date',
];

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** agent-manager's `start_session`, creating the session only. */
const callTool = jest.fn();
const musterApi = { callTool } as unknown as MusterApi;
const getSessionDetail = jest.fn();
const listSessionTasks = jest.fn();
// The first message's turn: left running, it is not what this test watches.
const streamMessage = jest.fn(() => new Promise<void>(() => {}));

const kagentApi = {
  getSessionDetail,
  listSessionTasks,
  streamMessage,
} as unknown as KagentApi;

/**
 * Every error text that was ever in the document — a flash is precisely what
 * a final-state assertion would miss. Read on every React commit (the
 * `Profiler` below calls it synchronously after each one), because a
 * MutationObserver's batched callback reads nodes as they are *later*, after
 * a flashed error has already been replaced.
 */
const seenErrors = new Set<string>();
function recordCommit() {
  const text = document.body.textContent ?? '';
  for (const candidate of ERROR_TEXTS) {
    if (text.includes(candidate)) {
      seenErrors.add(candidate);
    }
  }
}

/**
 * The home screen's composer and the session page, each under its own mount
 * of the plugin's query provider — as in the app, where the new-session screen
 * and the Sessions tab are separate routers. Keyed, so the navigation mounts
 * the session page's provider afresh (and restores the persisted cache) rather
 * than reconciling it with the home screen's.
 */
async function startSession(sessionId: string) {
  callTool.mockResolvedValue({ session: { id: sessionId } });
  await renderInTestApp(
    <Profiler id="new-session" onRender={recordCommit}>
      <Routes>
        <Route
          path="/"
          element={
            <QueryClientProvider key="home">
              <StartNewSession entryPoint="home" layout="standalone" />
            </QueryClientProvider>
          }
        />
        <Route
          path="/sessions/:installation/:sessionId"
          element={
            <QueryClientProvider key="sessions">
              <SessionDetailRoute />
            </QueryClientProvider>
          }
        />
      </Routes>
    </Profiler>,
    {
      apis: [
        [kagentApiRef, kagentApi],
        [musterApiRef, musterApi],
      ],
      mountedRoutes: {
        '/sessions': sessionsRouteRef,
        '/customize/agents': agentsRouteRef,
      },
    },
  );

  await userEvent.type(
    screen.getByRole('textbox', { name: 'Prompt' }),
    'Why is the ingress failing?',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Start' }));
}

beforeEach(() => {
  window.localStorage.clear();
  seenErrors.clear();
  callTool.mockReset();
  getSessionDetail.mockReset();
  listSessionTasks.mockReset();
  streamMessage.mockClear();
});

describe('SessionDetailPage — a session started a moment ago', () => {
  it('shows loading, never an error, while the new session is not readable yet', async () => {
    // The controller has made the session; the first read misses it, as kagent
    // reads lagging a create do, and the next one finds it. The query client
    // retries neither a 404 nor a 503 on its own.
    getSessionDetail
      .mockRejectedValueOnce(namedError('NotFoundError', 'no such session'))
      .mockResolvedValue(detail);
    listSessionTasks
      .mockRejectedValueOnce(
        namedError('ServiceUnavailableError', 'kagent is not ready'),
      )
      .mockResolvedValue(tasks);

    await startSession('new-1');

    // The conversation, with the first message dispatched from the handoff:
    // start_session created the session without one.
    expect(
      await screen.findByRole('button', { name: /^Rename session/ }),
    ).toBeInTheDocument();
    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_start_session',
      expect.not.objectContaining({ message: expect.anything() }),
      expect.any(String),
    );
    expect(streamMessage).toHaveBeenCalledTimes(1);
    expect(getSessionDetail).toHaveBeenCalledTimes(2);
    expect(listSessionTasks).toHaveBeenCalledTimes(2);

    expect([...seenErrors]).toEqual([]);
  });

  it('shows loading, not an error, while the query cache is being restored', async () => {
    // Both reads succeed at once: the only window left is the persisted
    // cache's restore on the session page's provider mount, during which
    // react-query reports its queries as idle with no data.
    getSessionDetail.mockResolvedValue(detail);
    listSessionTasks.mockResolvedValue(tasks);

    await startSession('new-2');

    expect(
      await screen.findByRole('button', { name: /^Rename session/ }),
    ).toBeInTheDocument();

    expect([...seenErrors]).toEqual([]);
  });

  it('still says so when the new session never becomes readable', async () => {
    // A real failure is not hidden: once the settle window is spent, the 404
    // is believed. About six seconds of real time, by design.
    getSessionDetail.mockRejectedValue(
      namedError('NotFoundError', 'no such session'),
    );
    listSessionTasks.mockResolvedValue(tasks);

    await startSession('new-3');

    expect(
      await screen.findByText('Session not found', undefined, {
        timeout: 15_000,
      }),
    ).toBeInTheDocument();
    // Nothing else came first.
    expect([...seenErrors]).toEqual(['Session not found']);
  }, 20_000);
});
