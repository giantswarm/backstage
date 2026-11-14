import {
  addTally,
  emptyTally,
  HITL_EXTENSION_URI,
  isListableSession,
  isRuntimeLostReason,
  normalizeSessionDetail,
  normalizeSessionList,
  normalizeTaskList,
  readInstanceFailureReason,
  readNewestTaskState,
  readTaskFailureReason,
  reduceSessionUsage,
  USAGE_TOP_N,
  utcDayKey,
  type A2aTaskWire,
  type KagentSession,
  type KagentSessionDetail,
  type SessionRecordWire,
  type SessionStateEntry,
  type SessionStatesResponse,
  type SessionUsageResponse,
  type UsageAgentEntry,
  type UsageDayEntry,
  type UsageRemainder,
  type UsageTally,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  baseDataSet,
  DAY,
  inInstallation,
  type FixtureDataSet,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type {
  ConfirmationAnswerRequest,
  OutboundMessage,
  RawSessionBodies,
  StreamEnd,
} from '../types';
import { sessionRecordOf } from './agentPlatformFixtureData';
import { FIXTURE_USER } from './fixtureIdentity';
import {
  conversationOf,
  FRAME_MS,
  runtimeLostText,
  streamedTurn,
  type Agent,
  type V1Object,
} from './kagentConversations';

/** The window and the cap of the session states summary, as the backend's. */
const STATES_MAX_AGE_MS = 7 * DAY;
const STATES_MAX_SESSIONS = 20;

/** The window and the cap of the usage summary, as the backend's. */
const USAGE_WINDOW_DAYS = 30;
const USAGE_MAX_SESSIONS = 60;

/**
 * The top entries by count and what the cap left out, ranked as the backend
 * ranks them.
 */
function topBy<T>(
  counts: Map<string | null, number>,
  make: (key: string | null, calls: number) => T,
): { top: T[]; other: UsageRemainder } {
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] ?? '').localeCompare(b[0] ?? ''),
  );
  const rest = ranked.slice(USAGE_TOP_N);
  return {
    top: ranked.slice(0, USAGE_TOP_N).map(([key, calls]) => make(key, calls)),
    other: {
      count: rest.length,
      calls: rest.reduce((sum, [, calls]) => sum + calls, 0),
    },
  };
}

/**
 * How long a stream of a turn that runs on without an end stays open: the
 * gateway in front of the controller cuts a stream at 60 seconds, and the
 * page subscribes again.
 */
export const STREAM_CUT_MS = 55_000;

/** How long ago a turn that keeps running last said something. */
const WORKING_ACTIVITY_MS = 2_000;

const TERMINAL = new Set([
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_REJECTED',
  'TASK_STATE_INPUT_REQUIRED',
  'TASK_STATE_AUTH_REQUIRED',
]);

/** A turn being replayed: its frames, the next one, and who follows them. */
type Run = {
  frames: V1Object[];
  next: number;
  timer?: ReturnType<typeof setTimeout>;
  listeners: Set<(frame: V1Object) => void>;
};

type StoredSession = {
  record: SessionRecordWire;
  /** A2A v1 tasks, oldest first. */
  tasks: V1Object[];
  /** The task that keeps running without frames, the seeded running turn. */
  keepsWorking?: string;
  runs: Map<string, Run>;
};

/** An error as the real client throws it for the backend's answer. */
export function kagentError(
  status: number,
  message: string,
  reason?: string,
): Error {
  const names: Record<number, string> = {
    401: 'UnauthorizedError',
    403: 'ForbiddenError',
    404: 'NotFoundError',
    409: 'ConflictError',
    503: 'ServiceUnavailableError',
  };
  const error = Object.assign(new Error(message), {
    status,
    ...(reason && { reason }),
  });
  error.name = names[status] ?? 'Error';
  return error;
}

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const stateOf = (task: V1Object) =>
  (task.status as { state?: string } | undefined)?.state;

/** A task's status as it moves: a status update replaces it, an artifact joins or grows. */
function applyFrame(
  task: V1Object | undefined,
  frame: V1Object,
): V1Object | undefined {
  if (frame.task) {
    return json(frame.task as V1Object);
  }
  if (!task) {
    return task;
  }
  const status = frame.statusUpdate as { status?: V1Object } | undefined;
  if (status?.status) {
    const previous = task.status as { message?: V1Object } | undefined;
    // a2a-go moves a status message into history when the next status
    // replaces it.
    const history = previous?.message
      ? [...((task.history as V1Object[]) ?? []), previous.message]
      : task.history;
    return { ...task, history, status: json(status.status) };
  }
  const update = frame.artifactUpdate as
    { artifact: V1Object; append?: boolean } | undefined;
  if (update) {
    const artifacts = [...((task.artifacts as V1Object[]) ?? [])];
    const index = artifacts.findIndex(
      artifact => artifact.artifactId === update.artifact.artifactId,
    );
    if (index < 0) {
      artifacts.push(json(update.artifact));
    } else if (update.append) {
      artifacts[index] = {
        ...artifacts[index],
        parts: [
          ...((artifacts[index].parts as V1Object[]) ?? []),
          ...json(update.artifact.parts as V1Object[]),
        ],
      };
    } else {
      artifacts[index] = json(update.artifact);
    }
    return { ...task, artifacts };
  }
  return task;
}

/** The HITL request a waiting task's status message carries. */
function hitlRequestOf(task: V1Object): V1Object | undefined {
  const message = (task.status as { message?: V1Object } | undefined)?.message;
  if (
    !message ||
    !((message.extensions as string[] | undefined) ?? []).includes(
      HITL_EXTENSION_URI,
    )
  ) {
    return undefined;
  }
  return (message.metadata as V1Object | undefined)?.[HITL_EXTENSION_URI] as
    V1Object | undefined;
}

/** The text the backend records as the person's words for an answer. */
function renderDecision(answer: ConfirmationAnswerRequest): string {
  if (answer.answers && answer.answers.length > 0) {
    return answer.answers.map(values => values.join(', ')).join('\n');
  }
  return answer.decision === 'approve' ? 'Approved.' : 'Rejected.';
}

/** Why kagent refuses a session name, as the controller checks it. */
function nameRefusal(name: string): string | undefined {
  if (name.length > 200) {
    return 'name must be at most 200 characters';
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return 'name must not contain control characters';
  }
  if (name !== name.trim()) {
    return 'name must not begin or end with whitespace';
  }
  return undefined;
}

/** What an answered turn's replayed reply ends with. */
const FIXTURE_ANSWERED =
  'Fixture mode replays the rest of this turn from a recorded kagent stream.';

/** The replayed reply to an answer. */
function answeredReply(
  request: V1Object,
  answer: ConfirmationAnswerRequest,
): string {
  if (request.type === 'ask_user_request') {
    return `Thanks, I go on with that. ${FIXTURE_ANSWERED}`;
  }
  return answer.decision === 'approve'
    ? `The tool call ran. ${FIXTURE_ANSWERED}`
    : `I did not run the tool call. ${FIXTURE_ANSWERED}`;
}

/**
 * kagent in fixture mode: the sessions of the data set with their
 * conversations, and the sessions agent-manager's `start_session` creates.
 * Turns are replayed from the recorded stream on a timer, so a turn runs on
 * when its stream is cut, as a real one does; streams and subscriptions follow
 * it. Everything is kept in memory until the page reloads. Refusals use the
 * backend's words (`KagentClient` in agent-platform-backend).
 */
export class KagentFixtureState {
  private readonly installations = new Map<
    string,
    Map<string, StoredSession>
  >();

  constructor(
    private readonly data: FixtureDataSet = baseDataSet(),
    private readonly now: () => number = Date.now,
  ) {}

  private sessionsOf(installation: string): Map<string, StoredSession> {
    let sessions = this.installations.get(installation);
    if (!sessions) {
      sessions = new Map(
        inInstallation(this.data.sessions, installation).map(session => {
          const tasks = conversationOf(session);
          const newest = tasks[tasks.length - 1];
          return [
            session.id,
            {
              record: sessionRecordOf(session),
              tasks,
              ...(session.turn === 'working' && {
                keepsWorking: newest.id as string,
              }),
              runs: new Map(),
            },
          ];
        }),
      );
      this.installations.set(installation, sessions);
    }
    return sessions;
  }

  /** Fails a call to an installation whose kagent the portal cannot reach. */
  private reachable(installation: string): void {
    const known = this.data.installations.find(
      candidate => candidate.name === installation,
    );
    if (known?.state === 'unreachable') {
      throw kagentError(
        500,
        `The kagent API for installation '${installation}' did not respond in time.`,
        'timeout',
      );
    }
  }

  private session(installation: string, sessionId: string): StoredSession {
    this.reachable(installation);
    const session = this.sessionsOf(installation).get(sessionId);
    if (!session) {
      throw kagentError(
        404,
        `That session does not exist on installation '${installation}'. It may have been deleted, or it may belong to another user.`,
      );
    }
    return session;
  }

  /** The tasks as they are now: a turn that keeps running said something just now. */
  private tasksNow(session: StoredSession): V1Object[] {
    return session.tasks.map(task => {
      if (task.id !== session.keepsWorking) {
        return json(task);
      }
      return {
        ...json(task),
        status: {
          ...(task.status as V1Object),
          timestamp: new Date(this.now() - WORKING_ACTIVITY_MS).toISOString(),
        },
      };
    });
  }

  private tasksBody(session: StoredSession): V1Object {
    const tasks = this.tasksNow(session);
    return tasks.length > 0
      ? { tasks, totalSize: tasks.length }
      : { totalSize: 0 };
  }

  // The reads

  listSessions(installation: string): KagentSession[] {
    this.reachable(installation);
    return normalizeSessionList(
      {
        sessions: [...this.sessionsOf(installation).values()].map(session =>
          json(session.record),
        ),
      },
      installation,
    ).sessions;
  }

  getSessionDetail(
    installation: string,
    sessionId: string,
  ): KagentSessionDetail | undefined {
    const session = this.session(installation, sessionId);
    return normalizeSessionDetail(
      { session: json(session.record) },
      installation,
    ).detail;
  }

  listSessionTasks(installation: string, sessionId: string): A2aTaskWire[] {
    this.reachable(installation);
    const session = this.sessionsOf(installation).get(sessionId);
    if (!session) {
      // kagent's task listing refuses a session that is not the caller's,
      // or gone, rather than not finding it.
      throw kagentError(
        403,
        `Not authorized to use the kagent API for installation '${installation}'`,
      );
    }
    return normalizeTaskList(this.tasksBody(session)).tasks;
  }

  getRawSession(installation: string, sessionId: string): RawSessionBodies {
    const session = this.session(installation, sessionId);
    return {
      sessionBody: { session: json(session.record) },
      tasksBody: this.tasksBody(session),
    };
  }

  /**
   * The states summary as the backend computes it: the listable sessions that
   * moved in the last seven days, newest first and at most twenty, each by
   * its runtime's state where that decides, by its newest turn otherwise.
   */
  listSessionStates(installation: string): SessionStatesResponse {
    const now = this.now();
    const sessions = this.sessionsOf(installation);
    const inWindow = this.listSessions(installation)
      .filter(isListableSession)
      .filter(
        session =>
          !session.updatedAt ||
          now - Date.parse(session.updatedAt) <= STATES_MAX_AGE_MS,
      )
      .sort(
        (a, b) =>
          (b.updatedAt ? Date.parse(b.updatedAt) : -Infinity) -
          (a.updatedAt ? Date.parse(a.updatedAt) : -Infinity),
      );
    const states: SessionStateEntry[] = inWindow
      .slice(0, STATES_MAX_SESSIONS)
      .map(session => {
        if (
          session.state === 'failed' ||
          session.state === 'creating' ||
          session.state === 'deleting'
        ) {
          const changedAt = session.updatedAt
            ? Date.parse(session.updatedAt)
            : NaN;
          return {
            sessionId: session.sessionId,
            state: session.state,
            ...(!Number.isNaN(changedAt) && { changedAt }),
            ...(session.state === 'failed' && {
              failureReason: readInstanceFailureReason(session.failure),
            }),
          };
        }
        const stored = sessions.get(session.sessionId)!;
        const { tasks } = normalizeTaskList(this.tasksBody(stored));
        const newest = readNewestTaskState(tasks);
        const failureReason = isRuntimeLostReason(session.failure?.reason)
          ? 'runtime-lost'
          : newest && readTaskFailureReason(tasks[newest.index]);
        return {
          sessionId: session.sessionId,
          state: newest?.state.raw ?? null,
          ...(newest?.changedAt !== undefined && {
            changedAt: newest.changedAt,
          }),
          ...(failureReason !== undefined && { failureReason }),
        };
      });
    return {
      evaluatedAt: now,
      states,
      unreadable: [],
      skipped: Math.max(0, inWindow.length - STATES_MAX_SESSIONS),
    };
  }

  /**
   * The person's usage summary as the backend computes it from the
   * conversations: the listable sessions that moved in the window (and a day
   * before it), newest first and at most sixty, their turns in the window
   * totalled by day, agent, tool and MCP server.
   */
  getSessionUsage(installation: string): SessionUsageResponse {
    const endMs = this.now();
    const startMs = endMs - USAGE_WINDOW_DAYS * DAY;
    const sessions = this.sessionsOf(installation);
    const inWindow = this.listSessions(installation)
      .filter(isListableSession)
      .filter(
        session =>
          !session.updatedAt ||
          endMs - Date.parse(session.updatedAt) <=
            (USAGE_WINDOW_DAYS + 1) * DAY,
      )
      .sort(
        (a, b) =>
          (b.updatedAt ? Date.parse(b.updatedAt) : -Infinity) -
          (a.updatedAt ? Date.parse(a.updatedAt) : -Infinity),
      );

    const totals = emptyTally();
    let active = 0;
    let undatedTurns = 0;
    const days = new Map<string, UsageTally>();
    const lastActive = new Map<string, number>();
    const tools = new Map<string | null, number>();
    const servers = new Map<string | null, number>();
    const agents = new Map<string | null, UsageTally & { sessions: number }>();
    for (const session of inWindow.slice(0, USAGE_MAX_SESSIONS)) {
      const { tasks } = normalizeTaskList(
        this.tasksBody(sessions.get(session.sessionId)!),
      );
      const usage = reduceSessionUsage(tasks, { startMs, endMs });
      if (usage.tally.turns === 0) {
        continue;
      }
      active += 1;
      addTally(totals, usage.tally);
      undatedTurns += usage.undatedTurns;
      let newestDay: string | undefined;
      for (const [day, tally] of usage.days) {
        const existing = days.get(day) ?? emptyTally();
        addTally(existing, tally);
        days.set(day, existing);
        if (tally.turns > 0 && (!newestDay || day > newestDay)) {
          newestDay = day;
        }
      }
      if (newestDay) {
        lastActive.set(newestDay, (lastActive.get(newestDay) ?? 0) + 1);
      }
      for (const [tool, calls] of usage.tools) {
        tools.set(tool, (tools.get(tool) ?? 0) + calls);
      }
      for (const [server, calls] of usage.servers) {
        servers.set(server, (servers.get(server) ?? 0) + calls);
      }
      const agentId = session.agentId ?? null;
      const agent =
        agents.get(agentId) ?? Object.assign(emptyTally(), { sessions: 0 });
      addTally(agent, usage.tally);
      agent.sessions += 1;
      agents.set(agentId, agent);
    }

    const daily: UsageDayEntry[] = [];
    for (let at = startMs; at <= endMs; at += DAY) {
      const day = utcDayKey(at);
      if (daily.length > 0 && daily[daily.length - 1].day === day) {
        continue;
      }
      const tally = days.get(day);
      daily.push({
        day,
        inputTokens: tally?.inputTokens ?? 0,
        outputTokens: tally?.outputTokens ?? 0,
        turns: tally?.turns ?? 0,
        toolCalls: tally?.toolCalls ?? 0,
        lastActiveSessions: lastActive.get(day) ?? 0,
      });
    }
    const byAgent: UsageAgentEntry[] = [...agents.entries()]
      .map(([agentId, tally]) => ({
        agentId,
        sessions: tally.sessions,
        turns: tally.turns,
        inputTokens: tally.inputTokens,
        outputTokens: tally.outputTokens,
        ...(tally.costUsd !== undefined && { costUsd: tally.costUsd }),
      }))
      .sort(
        (a, b) =>
          b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens) ||
          (a.agentId ?? '').localeCompare(b.agentId ?? ''),
      );
    const rankedTools = topBy(tools, (tool, calls) => ({
      tool: tool ?? 'unknown tool',
      calls,
    }));
    const rankedServers = topBy(servers, (server, calls) => ({
      server,
      calls,
    }));
    return {
      evaluatedAt: endMs,
      windowStart: startMs,
      windowDays: USAGE_WINDOW_DAYS,
      totals: { ...totals, sessions: active },
      daily,
      byAgent,
      topTools: rankedTools.top,
      otherTools: rankedTools.other,
      topMcpServers: rankedServers.top,
      otherMcpServers: rankedServers.other,
      undatedTurns,
      unreadable: [],
      skipped: Math.max(0, inWindow.length - USAGE_MAX_SESSIONS),
    };
  }

  // The writes

  /**
   * The session agent-manager's `start_session` created: ready, with no turn
   * yet. The page it opens sends the first prompt as a turn.
   */
  createSession(
    installation: string,
    session: { id: string; agent: Agent; name?: string },
  ): void {
    const at = new Date(this.now()).toISOString();
    this.sessionsOf(installation).set(session.id, {
      record: {
        id: session.id,
        creator: FIXTURE_USER.sub,
        agent: { ...session.agent },
        state: 'RUNTIME_STATE_READY',
        createdAt: at,
        updatedAt: at,
        ...(session.name && { name: session.name }),
        contextId: session.id,
        changed: [],
      },
      tasks: [],
      runs: new Map(),
    });
  }

  renameSession(installation: string, sessionId: string, name: string): void {
    const session = this.session(installation, sessionId);
    const refusal = nameRefusal(name);
    if (refusal) {
      throw kagentError(
        400,
        `kagent on installation '${installation}' rejected the session name: ${refusal}`,
      );
    }
    session.record = { ...session.record, name };
  }

  /**
   * Deletes a session: kagent tears its runtime down, and every read answers
   * 404 for it from then on.
   */
  deleteSession(installation: string, sessionId: string): void {
    const session = this.session(installation, sessionId);
    for (const run of session.runs.values()) {
      clearTimeout(run.timer);
    }
    this.sessionsOf(installation).delete(sessionId);
  }

  cancelTask(installation: string, sessionId: string, taskId: string): void {
    const session = this.session(installation, sessionId);
    const index = session.tasks.findIndex(task => task.id === taskId);
    if (index < 0) {
      throw kagentError(
        404,
        `That turn does not exist on installation '${installation}'.`,
      );
    }
    const state = stateOf(session.tasks[index]);
    if (state && TERMINAL.has(state) && state !== 'TASK_STATE_INPUT_REQUIRED') {
      return;
    }
    const run = session.runs.get(taskId);
    if (run) {
      clearTimeout(run.timer);
    }
    if (session.keepsWorking === taskId) {
      session.keepsWorking = undefined;
    }
    const frame: V1Object = {
      statusUpdate: {
        taskId,
        contextId: sessionId,
        status: {
          state: 'TASK_STATE_CANCELED',
          timestamp: new Date(this.now()).toISOString(),
        },
      },
    };
    session.tasks[index] = applyFrame(session.tasks[index], frame)!;
    if (run) {
      session.runs.delete(taskId);
      for (const listener of run.listeners) {
        listener(json(frame));
      }
    }
  }

  /** Replays `frames` as task `taskId`'s turn, one per {@link FRAME_MS}. */
  private run(session: StoredSession, taskId: string, frames: V1Object[]): Run {
    const run: Run = { frames, next: 0, listeners: new Set() };
    session.runs.set(taskId, run);
    const step = () => {
      const frame = run.frames[run.next];
      run.next += 1;
      const index = session.tasks.findIndex(task => task.id === taskId);
      const task = applyFrame(
        index < 0 ? undefined : session.tasks[index],
        frame,
      );
      if (task) {
        if (index < 0) {
          session.tasks.push(task);
        } else {
          session.tasks[index] = task;
        }
      }
      for (const listener of run.listeners) {
        listener(json(frame));
      }
      if (run.next < run.frames.length) {
        run.timer = setTimeout(step, FRAME_MS);
      } else {
        session.runs.delete(taskId);
      }
    };
    step();
    return run;
  }

  /**
   * Follows `run` for a stream: every frame from now on until the turn ends,
   * the stream is aborted or the gateway would cut it.
   */
  private follow(
    run: Run | undefined,
    onEvent: (frame: unknown) => void,
    signal: AbortSignal | undefined,
    seen: V1Object[] = [],
  ): Promise<StreamEnd> {
    for (const frame of seen) {
      onEvent(json(frame));
    }
    return new Promise(resolve => {
      const following: { cut?: ReturnType<typeof setTimeout> } = {};
      function done() {
        if (run) {
          run.listeners.delete(listener);
        }
        clearTimeout(following.cut);
        signal?.removeEventListener('abort', done);
        resolve({});
      }
      function listener(frame: V1Object) {
        onEvent(frame);
        const state = (frame.statusUpdate as { status?: { state?: string } })
          ?.status?.state;
        if (state && TERMINAL.has(state)) {
          done();
        }
      }
      if (signal?.aborted) {
        done();
        return;
      }
      signal?.addEventListener('abort', done);
      following.cut = setTimeout(done, STREAM_CUT_MS);
      if (run) {
        run.listeners.add(listener);
      }
    });
  }

  /** Refuses a turn while another runs: one active task per session. */
  private mustBeIdle(installation: string, session: StoredSession): void {
    const busy =
      session.runs.size > 0 ||
      session.tasks.some(task => {
        const state = stateOf(task);
        return (
          state === 'TASK_STATE_WORKING' || state === 'TASK_STATE_SUBMITTED'
        );
      });
    if (busy) {
      throw kagentError(
        409,
        `The agent on installation '${installation}' is still working on the previous message: AgentInstance ${session.record.id} already has an active task: conflict`,
      );
    }
  }

  /**
   * A new turn: the person's message, replayed through the recorded stream.
   * A session whose runtime kagent lost fails the turn as kagent does.
   */
  streamMessage(
    installation: string,
    sessionId: string,
    agent: Agent,
    message: OutboundMessage,
    onEvent: (frame: unknown) => void,
    signal?: AbortSignal,
  ): Promise<StreamEnd> {
    const session = this.session(installation, sessionId);
    this.mustBeIdle(installation, session);
    const taskId = globalThis.crypto.randomUUID();
    const frames = streamedTurn({
      sessionId,
      taskId,
      agent,
      message: {
        messageId: message.messageId,
        parts: [
          { text: message.text },
          ...(message.images ?? []).map(image => ({
            raw: image.data,
            mediaType: image.mediaType,
            ...(image.name && { filename: image.name }),
          })),
        ],
      },
      startsAt: this.now(),
      ...(isRuntimeLostReason(session.record.failure?.reason) && {
        failure: runtimeLostText(sessionId),
      }),
    });
    const run = this.run(session, taskId, frames);
    return this.follow(run, onEvent, signal, frames.slice(0, run.next));
  }

  sendMessage(
    installation: string,
    sessionId: string,
    agent: Agent,
    message: OutboundMessage,
  ): void {
    void this.streamMessage(installation, sessionId, agent, message, () => {});
  }

  /**
   * Answers the confirmation a task waits on and resumes it, checked as the
   * backend checks an answer against the request kagent recorded.
   */
  streamAnswer(
    installation: string,
    sessionId: string,
    agent: Agent,
    answer: ConfirmationAnswerRequest,
    onEvent: (frame: unknown) => void,
    signal?: AbortSignal,
  ): Promise<StreamEnd> {
    const session = this.session(installation, sessionId);
    const task = session.tasks.find(
      candidate => candidate.id === answer.taskId,
    );
    if (!task) {
      throw kagentError(
        404,
        `The turn this answer belongs to does not exist on installation '${installation}'.`,
      );
    }
    const request = hitlRequestOf(task);
    if (!request || stateOf(task) !== 'TASK_STATE_INPUT_REQUIRED') {
      throw kagentError(
        409,
        `The agent on installation '${installation}' is not waiting for a decision on this turn; it may already have been answered.`,
      );
    }
    const asking = (task.status as { message?: V1Object }).message;
    if (answer.askedIn && asking?.messageId !== answer.askedIn) {
      throw kagentError(
        409,
        `The agent on installation '${installation}' is waiting on another decision now; the one this answers was already answered.`,
      );
    }
    const response = this.hitlResponse(request, answer);
    const now = this.now();
    const reply = answeredReply(request, answer);
    const frames = streamedTurn({
      sessionId,
      taskId: answer.taskId,
      agent,
      message: { messageId: answer.messageId, parts: [] },
      startsAt: now,
      reply,
    }).slice(1);
    // The answer joins the task's history, and the task runs again.
    const answered: V1Object = {
      messageId: answer.messageId,
      contextId: sessionId,
      taskId: answer.taskId,
      role: 'ROLE_USER',
      parts: [{ text: answer.text ?? renderDecision(answer) }],
      metadata: {
        [HITL_EXTENSION_URI]: response,
        'kagent.dev/timeline-position': new Date(now).toISOString(),
      },
      extensions: [HITL_EXTENSION_URI],
    };
    const index = session.tasks.indexOf(task);
    session.tasks[index] = {
      ...task,
      history: [
        ...((task.history as V1Object[]) ?? []),
        ...(asking ? [asking] : []),
        answered,
      ],
      status: { state: 'TASK_STATE_SUBMITTED' },
    };
    const run = this.run(session, answer.taskId, frames);
    return this.follow(run, onEvent, signal, frames.slice(0, run.next));
  }

  answerConfirmation(
    installation: string,
    sessionId: string,
    agent: Agent,
    answer: ConfirmationAnswerRequest,
  ): void {
    void this.streamAnswer(installation, sessionId, agent, answer, () => {});
  }

  /** The typed HITL response, refused as the backend refuses a bad answer. */
  private hitlResponse(
    request: V1Object,
    answer: ConfirmationAnswerRequest,
  ): V1Object {
    if (request.type === 'tool_approval_request') {
      const approved = answer.decision === 'approve';
      return {
        type: 'tool_approval_response',
        approvals: ((request.tools as V1Object[]) ?? []).map(tool => ({
          id: tool.id,
          approved,
          ...(!approved &&
            answer.rejectionReason && {
              rejection_reason: answer.rejectionReason,
            }),
        })),
      };
    }
    if (answer.decision !== 'approve') {
      throw kagentError(
        400,
        'A question cannot be rejected; answer it, or leave the session waiting.',
      );
    }
    const questions = (request.questions as unknown[]) ?? [];
    const answers = answer.answers ?? [];
    if (answers.length !== questions.length) {
      throw kagentError(
        400,
        `The agent asked ${questions.length} question(s) and ${answers.length} answer(s) were given; every question needs one entry, in order.`,
      );
    }
    return {
      type: 'ask_user_response',
      id: request.id,
      answers: answers.map(values => ({ answer: values })),
    };
  }

  /**
   * Follows a turn again: its snapshot first, then its frames from now on, or
   * the snapshot alone of a turn already over. The seeded running turn has no
   * frames: its stream stays open until it is cut.
   */
  subscribeToTask(
    installation: string,
    sessionId: string,
    taskId: string,
    onEvent: (frame: unknown) => void,
    signal?: AbortSignal,
  ): Promise<StreamEnd> {
    const session = this.session(installation, sessionId);
    const task = this.tasksNow(session).find(
      candidate => candidate.id === taskId,
    );
    if (!task) {
      throw kagentError(
        404,
        `That turn does not exist in this session on installation '${installation}'.`,
      );
    }
    const snapshot = { task };
    const run = session.runs.get(taskId);
    if (run || session.keepsWorking === taskId) {
      return this.follow(run, onEvent, signal, [snapshot]);
    }
    onEvent(json(snapshot));
    return Promise.resolve({});
  }
}

let state: KagentFixtureState | undefined;

/** The state every kagent fixture reads: built on first use. */
export function kagentFixtureState(): KagentFixtureState {
  state ??= new KagentFixtureState();
  return state;
}
