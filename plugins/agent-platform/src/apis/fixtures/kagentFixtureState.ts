import {
  HITL_EXTENSION_URI,
  instanceDecidedState,
  isListableSession,
  isRuntimeLostReason,
  normalizeSessionDetail,
  normalizeSessionList,
  normalizeTaskList,
  selectCandidates,
  SessionUsageRollup,
  taskDecidedState,
  type A2aTaskWire,
  type KagentSession,
  type KagentSessionDetail,
  type SessionRecordWire,
  type SessionStatesResponse,
  type SessionUsageResponse,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  baseDataSet,
  DAY,
  inInstallation,
  type FixtureDataSet,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type { KagentInstallation } from '../../lib/kagentInstallations';
import type {
  ConfirmationAnswerRequest,
  OutboundMessage,
  RawSessionBodies,
  StreamEnd,
} from '../types';
import { sessionRecordOf } from './agentPlatformFixtureData';
import { FIXTURE_USER } from './fixtureIdentity';
import {
  approvedToolResult,
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
const USAGE_MAX_AGE_MS = (USAGE_WINDOW_DAYS + 1) * DAY;
const USAGE_MAX_SESSIONS = 60;

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

/** The runtime states in which kagent's store accepts no task. */
const NOT_ACCEPTING = new Set([
  'RUNTIME_STATE_CREATING',
  'RUNTIME_STATE_DELETING',
  'RUNTIME_STATE_FAILED',
]);

/** A stream following a task: each frame, and its end. */
type Follower = { frame: (frame: V1Object) => void; close: () => void };

type StoredSession = {
  record: SessionRecordWire;
  /** A2A v1 tasks, oldest first. */
  tasks: V1Object[];
  /** The task that keeps running without frames, the seeded running turn. */
  keepsWorking?: string;
  /** The next frame of each turn being replayed, by task. */
  timers: Map<string, ReturnType<typeof setTimeout>>;
  /** The streams following each task. */
  followers: Map<string, Set<Follower>>;
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

const frameState = (frame: V1Object) =>
  (frame.statusUpdate as { status?: { state?: string } } | undefined)?.status
    ?.state;

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

/** A HITL request, as the backend reads it off a waiting task (`readHitlRequest`). */
type HitlRequest =
  | {
      type: 'tool_approval_request';
      tools: { id: string; name?: string }[];
    }
  | { type: 'ask_user_request'; id: string; questions: unknown[] }
  | { type: 'url_elicitation_request'; id: string };

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/**
 * The HITL request a waiting task's status message carries, read as the
 * backend reads it: a request propagated from a child agent names the child's
 * tools under `nested`.
 */
export function hitlRequestOf(task: V1Object): HitlRequest | undefined {
  const message = (task.status as { message?: V1Object } | undefined)?.message;
  if (
    !message ||
    !((message.extensions as string[] | undefined) ?? []).includes(
      HITL_EXTENSION_URI,
    )
  ) {
    return undefined;
  }
  const payload = (message.metadata as V1Object | undefined)?.[
    HITL_EXTENSION_URI
  ] as V1Object | undefined;
  switch (payload?.type) {
    case 'tool_approval_request': {
      const nested = payload.nested as { tools?: unknown } | undefined;
      const source = Array.isArray(nested?.tools)
        ? nested.tools
        : payload.tools;
      const tools = (Array.isArray(source) ? source : [])
        .map(tool => tool as V1Object)
        .filter(tool => nonEmpty(tool?.id))
        .map(tool => ({ id: tool.id as string, name: nonEmpty(tool.name) }));
      return tools.length > 0 ? { type: payload.type, tools } : undefined;
    }
    case 'ask_user_request': {
      const id = nonEmpty(payload.id);
      return id
        ? {
            type: payload.type,
            id,
            questions: Array.isArray(payload.questions)
              ? payload.questions
              : [],
          }
        : undefined;
    }
    case 'url_elicitation_request': {
      const id = nonEmpty(payload.id);
      return id ? { type: payload.type, id } : undefined;
    }
    default:
      return undefined;
  }
}

/** The typed HITL response, refused as the backend's `buildHitlResponse` refuses a bad answer. */
export function hitlResponseOf(
  request: HitlRequest,
  answer: ConfirmationAnswerRequest,
): V1Object {
  if (request.type === 'tool_approval_request') {
    const approved = answer.decision === 'approve';
    return {
      type: 'tool_approval_response',
      approvals: request.tools.map(tool => ({
        id: tool.id,
        approved,
        ...(!approved &&
          answer.rejectionReason && {
            rejection_reason: answer.rejectionReason,
          }),
      })),
    };
  }
  if (request.type === 'url_elicitation_request') {
    return {
      type: 'url_elicitation_response',
      id: request.id,
      action: answer.decision === 'approve' ? 'accept' : 'decline',
    };
  }
  if (answer.decision !== 'approve') {
    throw kagentError(
      400,
      'A question cannot be rejected; answer it, or leave the session waiting.',
    );
  }
  const answers = answer.answers ?? [];
  if (answers.length !== request.questions.length) {
    throw kagentError(
      400,
      `The agent asked ${request.questions.length} question(s) and ${answers.length} answer(s) were given; every question needs one entry, in order.`,
    );
  }
  return {
    type: 'ask_user_response',
    id: request.id,
    answers: answers.map(values => ({ answer: values })),
  };
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
  request: HitlRequest,
  answer: ConfirmationAnswerRequest,
): string {
  const approved = answer.decision === 'approve';
  switch (request.type) {
    case 'ask_user_request':
      return `Thanks, I go on with that. ${FIXTURE_ANSWERED}`;
    case 'url_elicitation_request':
      return approved
        ? `Thanks for signing in. ${FIXTURE_ANSWERED}`
        : `I go on without that sign-in. ${FIXTURE_ANSWERED}`;
    default:
      return approved
        ? `The tool call ran. ${FIXTURE_ANSWERED}`
        : `I did not run the tool call. ${FIXTURE_ANSWERED}`;
  }
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

  /** The installations of the data set, as the backend reports kagent's reach. */
  listInstallations(): KagentInstallation[] {
    const reachable = {
      reachable: true,
      unreachable: false,
      unknown: 'unknown',
    } as const;
    return this.data.installations.map(installation => ({
      name: installation.name,
      reachable: reachable[installation.state],
      ...(installation.state === 'unreachable' && { reason: 'timeout' }),
    }));
  }

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
              timers: new Map(),
              followers: new Map(),
            },
          ];
        }),
      );
      this.installations.set(installation, sessions);
    }
    return sessions;
  }

  /**
   * Fails a call to an installation whose kagent the portal cannot reach, as
   * every call there fails: the request times out.
   */
  mustReach(installation: string): void {
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
    this.mustReach(installation);
    const session = this.sessionsOf(installation).get(sessionId);
    if (!session) {
      throw kagentError(
        404,
        `That session does not exist on installation '${installation}'. It may have been deleted, or it may belong to another user.`,
      );
    }
    return session;
  }

  /** A task as it is now: a turn that keeps running said something just now. */
  private current(session: StoredSession, task: V1Object): V1Object {
    if (task.id !== session.keepsWorking) {
      return task;
    }
    return {
      ...task,
      status: {
        ...(task.status as V1Object),
        timestamp: new Date(this.now() - WORKING_ACTIVITY_MS).toISOString(),
      },
    };
  }

  /** The task listing's body, a copy, as kagent answers it. */
  private tasksBody(session: StoredSession): V1Object {
    const tasks = session.tasks.map(task => json(this.current(session, task)));
    return tasks.length > 0
      ? { tasks, totalSize: tasks.length }
      : { totalSize: 0 };
  }

  /**
   * The tasks for a summary, uncopied, as the backend reads them: the
   * states summary asks for the status only (no history, no artifacts).
   */
  private tasksForSummary(
    session: StoredSession,
    statusOnly: boolean,
  ): A2aTaskWire[] {
    const tasks = session.tasks.map(task => {
      const now = this.current(session, task);
      return statusOnly
        ? { id: now.id, contextId: now.contextId, status: now.status }
        : now;
    });
    return normalizeTaskList(
      tasks.length > 0 ? { tasks, totalSize: tasks.length } : { totalSize: 0 },
    ).tasks;
  }

  // The reads

  listSessions(installation: string): KagentSession[] {
    this.mustReach(installation);
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
    this.mustReach(installation);
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
   * The states summary, with the backend's selection and derivation
   * (`selectCandidates`, `instanceDecidedState`, `taskDecidedState`): the
   * listable sessions that moved in the last seven days, newest first and at
   * most twenty.
   */
  listSessionStates(installation: string): SessionStatesResponse {
    const now = this.now();
    const sessions = this.sessionsOf(installation);
    const { candidates, pastCap } = selectCandidates(
      this.listSessions(installation).filter(isListableSession),
      { now, maxAgeMs: STATES_MAX_AGE_MS, maxSessions: STATES_MAX_SESSIONS },
    );
    return {
      evaluatedAt: now,
      states: candidates.map(
        session =>
          instanceDecidedState(session) ??
          taskDecidedState(
            session,
            this.tasksForSummary(sessions.get(session.sessionId)!, true),
          ),
      ),
      unreadable: [],
      skipped: pastCap,
    };
  }

  /**
   * The usage summary, with the backend's selection and rollup
   * (`selectCandidates`, `SessionUsageRollup`): the listable sessions that
   * moved in the window and a day before it, at most sixty.
   */
  getSessionUsage(installation: string): SessionUsageResponse {
    const endMs = this.now();
    const sessions = this.sessionsOf(installation);
    const { candidates, pastCap } = selectCandidates(
      this.listSessions(installation).filter(isListableSession),
      {
        now: endMs,
        maxAgeMs: USAGE_MAX_AGE_MS,
        maxSessions: USAGE_MAX_SESSIONS,
      },
    );
    const rollup = new SessionUsageRollup({
      startMs: endMs - USAGE_WINDOW_DAYS * DAY,
      endMs,
    });
    for (const session of candidates) {
      rollup.add(
        session,
        this.tasksForSummary(sessions.get(session.sessionId)!, false),
      );
    }
    return rollup.result({
      windowDays: USAGE_WINDOW_DAYS,
      unreadable: [],
      skipped: pastCap,
    });
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
      timers: new Map(),
      followers: new Map(),
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
   * Deletes a session: kagent tears its runtime down, every stream following
   * it ends, and every read answers 404 for it from then on.
   */
  deleteSession(installation: string, sessionId: string): void {
    const session = this.session(installation, sessionId);
    for (const timer of session.timers.values()) {
      clearTimeout(timer);
    }
    session.timers.clear();
    for (const followers of session.followers.values()) {
      for (const follower of [...followers]) {
        follower.close();
      }
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
    clearTimeout(session.timers.get(taskId));
    session.timers.delete(taskId);
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
    this.touch(session);
    this.emit(session, taskId, frame);
  }

  /** The session record moves with its runtime: ready while it works, now. */
  private touch(session: StoredSession): void {
    session.record = {
      ...session.record,
      state: 'RUNTIME_STATE_READY',
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  /** Hands a frame to every stream following the task. */
  private emit(session: StoredSession, taskId: string, frame: V1Object): void {
    for (const follower of [...(session.followers.get(taskId) ?? [])]) {
      follower.frame(json(frame));
    }
  }

  /** Replays `frames` as task `taskId`'s turn, one per {@link FRAME_MS}. */
  private run(
    session: StoredSession,
    taskId: string,
    frames: V1Object[],
  ): void {
    this.touch(session);
    let next = 0;
    const step = () => {
      const frame = frames[next];
      next += 1;
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
      this.emit(session, taskId, frame);
      if (next < frames.length) {
        session.timers.set(taskId, setTimeout(step, FRAME_MS));
      } else {
        session.timers.delete(taskId);
      }
    };
    step();
  }

  /**
   * Follows task `taskId` for a stream: `first` at once, then every frame
   * until the turn ends, the session goes, the stream is aborted or the
   * gateway would cut it.
   */
  private follow(
    session: StoredSession,
    taskId: string,
    onEvent: (frame: unknown) => void,
    signal: AbortSignal | undefined,
    first: V1Object[],
  ): Promise<StreamEnd> {
    for (const frame of first) {
      onEvent(json(frame));
    }
    return new Promise(resolve => {
      if (signal?.aborted) {
        resolve({});
        return;
      }
      const timer: { cut?: ReturnType<typeof setTimeout> } = {};
      const followers = session.followers.get(taskId) ?? new Set();
      session.followers.set(taskId, followers);
      const follower: Follower = {
        frame: frame => {
          onEvent(frame);
          const state = frameState(frame);
          if (state && TERMINAL.has(state)) {
            follower.close();
          }
        },
        close: () => {
          followers.delete(follower);
          clearTimeout(timer.cut);
          signal?.removeEventListener('abort', follower.close);
          resolve({});
        },
      };
      timer.cut = setTimeout(follower.close, STREAM_CUT_MS);
      signal?.addEventListener('abort', follower.close);
      followers.add(follower);
    });
  }

  /**
   * Refuses a turn or a reply kagent would not take: on a session whose
   * runtime is being created, deleted or failed (its store's words), or while
   * another turn runs (one active task per session).
   */
  private mustAccept(
    installation: string,
    session: StoredSession,
    what: 'task' | 'reply',
  ): void {
    const state = session.record.state ?? '';
    if (NOT_ACCEPTING.has(state)) {
      const instanceState = state.replace(
        'RUNTIME_STATE_',
        'AGENT_INSTANCE_STATE_',
      );
      const subject =
        what === 'task'
          ? `AgentInstance ${session.record.id}`
          : 'AgentInstance';
      throw kagentError(
        409,
        `The kagent API for installation '${installation}' reported a conflict: ${subject} cannot accept a ${what} in state ${instanceState} with operation AGENT_INSTANCE_OPERATION_UNSPECIFIED: conflict`,
      );
    }
    if (what === 'reply') {
      return;
    }
    const busy =
      session.timers.size > 0 ||
      session.tasks.some(task => {
        const taskState = stateOf(task);
        return (
          taskState === 'TASK_STATE_WORKING' ||
          taskState === 'TASK_STATE_SUBMITTED'
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
    this.mustAccept(installation, session, 'task');
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
    this.run(session, taskId, frames);
    return this.follow(session, taskId, onEvent, signal, frames.slice(0, 1));
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
   * backend checks an answer against the request kagent recorded. An
   * approved tool call runs: its recorded result joins the turn before the
   * reply.
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
    const response = hitlResponseOf(request, answer);
    this.mustAccept(installation, session, 'reply');
    const now = this.now();
    const ran =
      request.type === 'tool_approval_request' && answer.decision === 'approve'
        ? approvedToolResult(request.tools, {
            sessionId,
            taskId: answer.taskId,
            agent,
          })
        : undefined;
    const frames = streamedTurn({
      sessionId,
      taskId: answer.taskId,
      agent,
      message: { messageId: answer.messageId, parts: [] },
      startsAt: now,
      reply: answeredReply(request, answer),
      ...(ran && { toolResult: ran }),
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
    this.run(session, answer.taskId, frames);
    return this.follow(
      session,
      answer.taskId,
      onEvent,
      signal,
      frames.slice(0, 1),
    );
  }

  answerConfirmation(
    installation: string,
    sessionId: string,
    agent: Agent,
    answer: ConfirmationAnswerRequest,
  ): void {
    void this.streamAnswer(installation, sessionId, agent, answer, () => {});
  }

  /**
   * Follows a turn again: its snapshot first, then its frames from now on, or
   * the snapshot alone of a turn already over. The seeded running turn has no
   * frames: its stream stays open until it is canceled or cut.
   */
  subscribeToTask(
    installation: string,
    sessionId: string,
    taskId: string,
    onEvent: (frame: unknown) => void,
    signal?: AbortSignal,
  ): Promise<StreamEnd> {
    const session = this.session(installation, sessionId);
    const task = session.tasks.find(candidate => candidate.id === taskId);
    if (!task) {
      throw kagentError(
        404,
        `That turn does not exist in this session on installation '${installation}'.`,
      );
    }
    const snapshot = { task: this.current(session, task) };
    if (session.timers.has(taskId) || session.keepsWorking === taskId) {
      return this.follow(session, taskId, onEvent, signal, [snapshot]);
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
