import {
  isAgentWorking,
  normalizeTaskList,
  readAttachment,
  readRuntimeLoss,
  type A2aPartWire,
  type A2aTaskWire,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  createFixtureDataSet,
  type FixtureSession,
  type SessionTurn,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { readPendingConfirmation } from '../../lib/kagentHitl';
import { applyStreamEvent, createStreamTurn } from '../../lib/kagentStreamTurn';
import { AgentManagerFixtureState } from './agentManagerFixtureState';
import {
  conversationOf,
  FIXTURE_QUESTIONS,
  FIXTURE_REPLY,
  FRAME_MS,
} from './kagentConversations';
import { KagentFixtureState, STREAM_CUT_MS } from './kagentFixtureState';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const INSTALLATION = 'meadow';

function setup() {
  const data = createFixtureDataSet({ now: NOW });
  let now = NOW;
  const state = new KagentFixtureState(data, () => now);
  const sessionWith = (turn: SessionTurn): FixtureSession =>
    data.sessions.find(
      session => session.installation === INSTALLATION && session.turn === turn,
    )!;
  return {
    data,
    state,
    sessionWith,
    advance: (ms: number) => {
      now += ms;
      jest.advanceTimersByTime(ms);
    },
  };
}

const message = (text: string) => ({ messageId: `m-${text}`, text });

/** The frames a stream hands over, and how it ended. */
function collect() {
  const frames: unknown[] = [];
  return { frames, onEvent: (frame: unknown) => frames.push(frame) };
}

const allParts = (tasks: A2aTaskWire[]): A2aPartWire[] =>
  tasks.flatMap(task =>
    (task.history ?? []).flatMap(
      entry => (entry as { parts?: A2aPartWire[] }).parts ?? [],
    ),
  );

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('KagentFixtureState: the seeded sessions', () => {
  it('lists the sessions of the installation, read by the real parser', () => {
    const { data, state } = setup();
    const sessions = state.listSessions(INSTALLATION);
    expect(sessions.map(session => session.sessionId).sort()).toEqual(
      data.sessions
        .filter(session => session.installation === INSTALLATION)
        .map(session => session.id)
        .sort(),
    );
    expect(
      sessions.every(session => session.installation === INSTALLATION),
    ).toBe(true);
  });

  it('builds every conversation from recordings the real parser reads without drift', () => {
    const { data } = setup();
    for (const session of data.sessions) {
      const tasks = conversationOf(session);
      const { drift } = normalizeTaskList(
        tasks.length ? { tasks } : { totalSize: 0 },
      );
      expect(drift).toBeUndefined();
    }
  });

  it('summarises the states of the turns as the backend does', () => {
    const { state, sessionWith } = setup();
    const { states } = state.listSessionStates(INSTALLATION);
    const of = (turn: SessionTurn) =>
      states.find(entry => entry.sessionId === sessionWith(turn).id);
    expect(of('working')).toMatchObject({ state: 'working' });
    expect(of('approval')).toMatchObject({
      state: 'input-required',
    });
    expect(of('askUser')).toMatchObject({ state: 'input-required' });
    expect(of('failed')).toMatchObject({
      state: 'failed',
      failureReason: expect.any(String),
    });
    expect(of('canceled')).toMatchObject({ state: 'canceled' });
    expect(of('runtimeLost')).toMatchObject({ failureReason: 'runtime-lost' });
    // Newest first, and only the sessions of the last seven days.
    const moved = states.map(entry => entry.changedAt ?? 0);
    expect(states.length).toBeGreaterThan(0);
    for (const changedAt of moved) {
      expect(NOW - changedAt).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    }
  });

  it('reads a running turn, kept current, and the recorded attachment', () => {
    const { state, sessionWith, advance } = setup();
    const { id } = sessionWith('working');
    advance(60 * 60 * 1000);
    const tasks = state.listSessionTasks(INSTALLATION, id);
    expect(isAgentWorking(tasks, Date.now())).toBe(true);
    const attachments = allParts(tasks).map(readAttachment).filter(Boolean);
    expect(attachments).toEqual([
      expect.objectContaining({
        name: 'screenshot.png',
        declaredType: 'image/png',
      }),
    ]);
  });

  it('reads the confirmations a turn waits on', () => {
    const { state, sessionWith } = setup();
    expect(
      readPendingConfirmation(
        state.listSessionTasks(INSTALLATION, sessionWith('approval').id),
      ),
    ).toMatchObject({ asks: 'approval', toolName: 'filter_tools' });
    expect(
      readPendingConfirmation(
        state.listSessionTasks(INSTALLATION, sessionWith('askUser').id),
      ),
    ).toMatchObject({
      asks: 'input',
      questions: [
        {
          question: FIXTURE_QUESTIONS[0].question,
          choices: FIXTURE_QUESTIONS[0].choices,
          multiple: false,
        },
        { question: FIXTURE_QUESTIONS[1].question, multiple: false },
      ],
    });
  });

  it('reports a lost runtime on the session and in its conversation', () => {
    const { state, sessionWith } = setup();
    const { id } = sessionWith('runtimeLost');
    const detail = state.getSessionDetail(INSTALLATION, id);
    const loss = readRuntimeLoss(
      detail?.session,
      state.listSessionTasks(INSTALLATION, id),
    );
    expect(loss).toMatchObject({ reported: true });
    expect(JSON.stringify(detail)).not.toContain('compute.internal');
  });

  it('totals the usage of the conversations as the backend does', () => {
    const { state } = setup();
    const usage = state.getSessionUsage(INSTALLATION);
    expect(usage.windowDays).toBe(30);
    expect(usage.daily).toHaveLength(31);
    expect(usage.totals.sessions).toBeGreaterThan(0);
    expect(usage.totals.turns).toBeGreaterThanOrEqual(usage.totals.sessions);
    expect(usage.totals.inputTokens).toBeGreaterThan(0);
    expect(usage.topTools.map(tool => tool.tool)).toContain('filter_tools');
    expect(usage.byAgent.reduce((sum, agent) => sum + agent.sessions, 0)).toBe(
      usage.totals.sessions,
    );
  });

  it('answers the raw bodies of a session for its export', () => {
    const { state, sessionWith } = setup();
    const { id } = sessionWith('completed');
    const { sessionBody, tasksBody } = state.getRawSession(INSTALLATION, id);
    expect(sessionBody).toMatchObject({ session: { id } });
    expect(tasksBody).toMatchObject({ totalSize: 1 });
  });

  it('refuses what kagent refuses', () => {
    const { state } = setup();
    expect(() => state.getSessionDetail(INSTALLATION, 'gone')).toThrow(
      expect.objectContaining({
        name: 'NotFoundError',
        status: 404,
        message: `That session does not exist on installation '${INSTALLATION}'. It may have been deleted, or it may belong to another user.`,
      }),
    );
    expect(() => state.listSessionTasks(INSTALLATION, 'gone')).toThrow(
      expect.objectContaining({ name: 'ForbiddenError', status: 403 }),
    );
    expect(() => state.listSessions('tarragon')).toThrow(
      expect.objectContaining({ status: 500, reason: 'timeout' }),
    );
  });
});

describe('KagentFixtureState: turns', () => {
  it('opens a session agent-manager started and replays a turn on it', async () => {
    const { data, state, advance } = setup();
    const agent = data.agents.find(
      candidate =>
        candidate.installation === INSTALLATION &&
        candidate.state === 'ready' &&
        data.organizations.some(
          organization =>
            organization.namespace === candidate.namespace &&
            organization.state === 'ready',
        ),
    )!;
    const manager = new AgentManagerFixtureState(
      data,
      () => NOW,
      () => state,
    );
    const { session: started } = manager.startSession(INSTALLATION, {
      namespace: agent.namespace,
      name: agent.name,
      requestId: 'request-1',
      sessionName: 'Check the fixtures',
    });
    const session = { id: started.id! };

    expect(state.getSessionDetail(INSTALLATION, session.id)).toMatchObject({
      session: { sessionId: session.id, title: 'Check the fixtures' },
    });
    expect(state.listSessionTasks(INSTALLATION, session.id)).toEqual([]);

    const { frames, onEvent } = collect();
    const ended = state.streamMessage(
      INSTALLATION,
      session.id,
      agent,
      message('hello'),
      onEvent,
    );
    expect(frames).toHaveLength(1);
    advance(20 * FRAME_MS);
    await expect(ended).resolves.toEqual({});

    const turn = frames.reduce(applyStreamEvent, createStreamTurn('m-hello'));
    expect(turn.isFinal).toBe(true);
    expect(JSON.stringify(turn.items)).toContain(FIXTURE_REPLY);

    const [task] = state.listSessionTasks(INSTALLATION, session.id);
    expect(task.status?.state).toBe('completed');
    expect(task.history?.[0]).toMatchObject({
      messageId: 'm-hello',
      role: 'user',
    });
    expect(JSON.stringify(task.history)).toContain(FIXTURE_REPLY);
  });

  it('runs a turn on after its stream was cut, and follows it again', async () => {
    const { state, sessionWith, advance } = setup();
    const session = sessionWith('completed');
    const control = new AbortController();
    const first = collect();
    const ended = state.streamMessage(
      INSTALLATION,
      session.id,
      session.agent,
      message('cut'),
      first.onEvent,
      control.signal,
    );
    advance(FRAME_MS);
    control.abort();
    await expect(ended).resolves.toEqual({});

    const taskId = (first.frames[0] as { task: { id: string } }).task.id;
    expect(() =>
      state.streamMessage(
        INSTALLATION,
        session.id,
        session.agent,
        message('again'),
        () => {},
      ),
    ).toThrow(
      expect.objectContaining({
        name: 'ConflictError',
        message: expect.stringContaining('already has an active task'),
      }),
    );

    const second = collect();
    const followed = state.subscribeToTask(
      INSTALLATION,
      session.id,
      taskId,
      second.onEvent,
    );
    expect(second.frames[0]).toMatchObject({ task: { id: taskId } });
    advance(20 * FRAME_MS);
    await expect(followed).resolves.toEqual({});
    const tasks = state.listSessionTasks(INSTALLATION, session.id);
    expect(tasks[tasks.length - 1].status?.state).toBe('completed');
  });

  it('keeps the seeded running turn open until the stream is cut, and cancels it', async () => {
    const { state, sessionWith, advance } = setup();
    const { id } = sessionWith('working');
    const tasks = state.listSessionTasks(INSTALLATION, id);
    const taskId = tasks[tasks.length - 1].id!;
    const { frames, onEvent } = collect();
    const followed = state.subscribeToTask(INSTALLATION, id, taskId, onEvent);
    expect(frames).toHaveLength(1);
    advance(STREAM_CUT_MS);
    await expect(followed).resolves.toEqual({});

    state.cancelTask(INSTALLATION, id, taskId);
    const after = state.listSessionTasks(INSTALLATION, id);
    expect(after[after.length - 1].status?.state).toBe('canceled');
    // Canceling a turn already over is no error, and nothing changes.
    state.cancelTask(INSTALLATION, id, taskId);
    expect(() => state.cancelTask(INSTALLATION, id, 'gone')).toThrow(
      expect.objectContaining({ name: 'NotFoundError' }),
    );
  });

  it('resumes an approved tool call, and refuses a second answer', async () => {
    const { state, sessionWith, advance } = setup();
    const { id, agent } = sessionWith('approval');
    const pending = readPendingConfirmation(
      state.listSessionTasks(INSTALLATION, id),
    )!;
    const ended = state.streamAnswer(
      INSTALLATION,
      id,
      agent,
      {
        messageId: 'm-answer',
        taskId: pending.taskId,
        decision: 'approve',
        askedIn: pending.askedIn,
      },
      () => {},
    );
    advance(20 * FRAME_MS);
    await ended;
    const tasks = state.listSessionTasks(INSTALLATION, id);
    expect(tasks[0].status?.state).toBe('completed');
    expect(tasks[0].history).toContainEqual(
      expect.objectContaining({ messageId: 'm-answer', role: 'user' }),
    );
    expect(readPendingConfirmation(tasks)).toBeUndefined();

    expect(() =>
      state.streamAnswer(
        INSTALLATION,
        id,
        agent,
        { messageId: 'm-again', taskId: pending.taskId, decision: 'approve' },
        () => {},
      ),
    ).toThrow(
      expect.objectContaining({
        name: 'ConflictError',
        message: `The agent on installation '${INSTALLATION}' is not waiting for a decision on this turn; it may already have been answered.`,
      }),
    );
  });

  it('checks answers to questions as the backend does', async () => {
    const { state, sessionWith, advance } = setup();
    const { id, agent } = sessionWith('askUser');
    const pending = readPendingConfirmation(
      state.listSessionTasks(INSTALLATION, id),
    )!;
    const answer = {
      messageId: 'm-answer',
      taskId: pending.taskId,
      askedIn: pending.askedIn,
    };
    expect(() =>
      state.streamAnswer(
        INSTALLATION,
        id,
        agent,
        { ...answer, decision: 'reject' },
        () => {},
      ),
    ).toThrow(expect.objectContaining({ status: 400 }));
    expect(() =>
      state.streamAnswer(
        INSTALLATION,
        id,
        agent,
        { ...answer, decision: 'approve', answers: [['kube-system']] },
        () => {},
      ),
    ).toThrow(
      'The agent asked 2 question(s) and 1 answer(s) were given; every question needs one entry, in order.',
    );
    expect(() =>
      state.streamAnswer(
        INSTALLATION,
        id,
        agent,
        { ...answer, askedIn: 'elsewhere', decision: 'approve' },
        () => {},
      ),
    ).toThrow(expect.objectContaining({ name: 'ConflictError' }));

    const ended = state.streamAnswer(
      INSTALLATION,
      id,
      agent,
      { ...answer, decision: 'approve', answers: [['kube-system'], ['no']] },
      () => {},
    );
    advance(20 * FRAME_MS);
    await ended;
    const [task] = state.listSessionTasks(INSTALLATION, id);
    expect(task.status?.state).toBe('completed');
    expect(JSON.stringify(task.history)).toContain('kube-system\\nno');
  });

  it('fails a turn on a session whose runtime kagent lost', async () => {
    const { state, sessionWith, advance } = setup();
    const { id, agent } = sessionWith('runtimeLost');
    const ended = state.streamMessage(
      INSTALLATION,
      id,
      agent,
      message('still there?'),
      () => {},
    );
    advance(10 * FRAME_MS);
    await ended;
    const tasks = state.listSessionTasks(INSTALLATION, id);
    expect(tasks[tasks.length - 1].status).toMatchObject({
      state: 'failed',
      message: {
        parts: [{ text: `actor "ai-${id}" request timed out` }],
      },
    });
  });

  it('renames and deletes a session', () => {
    const { state, sessionWith } = setup();
    const { id } = sessionWith('completed');
    state.renameSession(INSTALLATION, id, 'Renamed');
    expect(state.getSessionDetail(INSTALLATION, id)?.session.title).toBe(
      'Renamed',
    );
    expect(() => state.renameSession(INSTALLATION, id, ' padded')).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    state.deleteSession(INSTALLATION, id);
    expect(() => state.getSessionDetail(INSTALLATION, id)).toThrow(
      expect.objectContaining({ name: 'NotFoundError' }),
    );
    expect(() => state.deleteSession(INSTALLATION, id)).toThrow(
      expect.objectContaining({ name: 'NotFoundError' }),
    );
  });
});
