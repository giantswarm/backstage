import {
  HITL_EXTENSION_URI,
  RUNTIME_LOST_REASON,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  attachmentPngV2,
  sessionRuntimeLost,
  streamKagent4a91c273,
  taskCanceledKagent4a91c273,
  tasksFailed,
  tasksHitlApprovalKagent4a91c273,
  tasksKagent4a91c273,
  tasksRuntimeLost,
} from '@giantswarm/backstage-plugin-agent-platform-common/testFixtures';
import {
  hashOf,
  MINUTE,
  type FixtureSession,
  type SessionTurn,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { FIXTURE_USER } from './fixtureIdentity';

/**
 * kagent's conversations in fixture mode, made of the recorded kagent API v2
 * answers in agent-platform-common (`testFixtures`): a task or a stream frame
 * as the controller sends it, the proto3 JSON of A2A v1. A recording is
 * recast onto a fixture session (its ids, its agent, its times); the states no
 * v1 recording has are derived from one, with the words of the older
 * recordings of that state.
 */

/** An A2A v1 object as proto3 JSON: a task, a message, a stream frame. */
export type V1Object = Record<string, unknown>;

export type Agent = { namespace: string; name: string };

/** What a recording is recast onto. */
type Target = {
  sessionId: string;
  taskId: string;
  agent: Agent;
  /** When the recording's last moment falls, in ms. */
  endsAt: number;
};

/** The keys whose values are RFC 3339 times, moved with the recording. */
const TIME_KEYS = new Set([
  'timestamp',
  'kagent.dev/timeline-position',
  'kagent.dev/task-created-at',
]);

/** The ids of messages and artifacts, unique per task once recast. */
const PART_ID_KEYS = new Set(['messageId', 'artifactId']);

function walk(
  value: unknown,
  visit: (key: string, value: unknown) => unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(item => walk(item, visit));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        walk(visit(key, item), visit),
      ]),
    );
  }
  return value;
}

function latestTime(value: unknown): number {
  let latest = Number.NEGATIVE_INFINITY;
  walk(value, (key, item) => {
    if (TIME_KEYS.has(key) && typeof item === 'string') {
      latest = Math.max(latest, Date.parse(item));
    }
    return item;
  });
  return latest;
}

/** The ADK app name kagent gives an agent's runtime. */
function appNameOf(agent: Agent): string {
  return `${agent.namespace}__NS__${agent.name.replace(/-/g, '_')}`;
}

/**
 * A recording recast onto `target`: the session as its context, the task's
 * own id, the agent and the person as its runtime names them, and every time
 * moved so the recording's last one is `endsAt`. Message and artifact ids
 * take the task's id as a prefix, so two tasks recast from one recording keep
 * them apart.
 */
export function recast<T>(recording: T, target: Target): T {
  const shift = target.endsAt - latestTime(recording);
  const prefix = target.taskId.slice(0, 8);
  // `walk` builds every object and array afresh, so the recording stays as
  // it was.
  return walk(recording, (key, value) => {
    if (typeof value !== 'string') {
      return value;
    }
    if (TIME_KEYS.has(key)) {
      return new Date(Date.parse(value) + shift).toISOString();
    }
    if (PART_ID_KEYS.has(key)) {
      return `${prefix}-${value}`;
    }
    switch (key) {
      case 'contextId':
      case 'adk_session_id':
        return target.sessionId;
      case 'taskId':
        return target.taskId;
      case 'adk_app_name':
        return appNameOf(target.agent);
      case 'adk_author':
        return target.agent.name.replace(/-/g, '_');
      case 'adk_user_id':
        return FIXTURE_USER.email;
      default:
        return value;
    }
  }) as T;
}

const firstTask = (list: unknown): V1Object =>
  (list as { tasks: V1Object[] }).tasks[0];

/** The recorded PNG attachment as an A2A v1 file part (`raw`, base64). */
export function attachmentPart(): V1Object {
  const { file } = attachmentPngV2.part as {
    file: { name: string; mimeType: string; bytes: string };
  };
  return { raw: file.bytes, mediaType: file.mimeType, filename: file.name };
}

/** The text of a legacy recording's failed status message. */
function failureTextOf(recording: unknown, index: number): string {
  const task = (recording as { data: V1Object[] }).data[index];
  const message = (task.status as { message: { parts: { text: string }[] } })
    .message;
  return message.parts[0].text;
}

/** A status message of the agent, as A2A v1. */
function agentMessage(
  target: Pick<Target, 'sessionId' | 'taskId'>,
  messageId: string,
  parts: V1Object[],
  extra: V1Object = {},
): V1Object {
  return {
    messageId,
    contextId: target.sessionId,
    taskId: target.taskId,
    role: 'ROLE_AGENT',
    parts,
    ...extra,
  };
}

/**
 * A task id of a seeded session's conversation: UUID-shaped, the same for the
 * same session and position.
 */
export function seededTaskId(sessionId: string, position: number): string {
  const digits = [0, 1, 2, 3]
    .map(n =>
      hashOf(`${sessionId}/${position}/${n}`).toString(16).padStart(8, '0'),
    )
    .join('');
  return `${digits.slice(0, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}-${digits.slice(16, 20)}-${digits.slice(20)}`;
}

/** A finished turn: tool calls approved by the person, an answer, and the recorded PNG on the prompt. */
function completedTask(target: Target): V1Object {
  const task = recast(firstTask(tasksKagent4a91c273), target);
  const history = task.history as V1Object[];
  const prompt = history[0];
  prompt.parts = [...(prompt.parts as V1Object[]), attachmentPart()];
  return { ...task, id: target.taskId };
}

/**
 * A turn the agent is writing a reply to: the recorded canceled turn before it
 * was canceled. Its status moves with the clock (see `KagentFixtureState`).
 */
function workingTask(target: Target): V1Object {
  const task = recast(taskCanceledKagent4a91c273 as V1Object, target);
  const status = task.status as V1Object;
  return {
    ...task,
    id: target.taskId,
    status: { ...status, state: 'TASK_STATE_WORKING' },
  };
}

/** A turn waiting on the person's approval of a tool call. */
function approvalTask(target: Target): V1Object {
  return {
    ...recast(firstTask(tasksHitlApprovalKagent4a91c273), target),
    id: target.taskId,
  };
}

/**
 * The recorded result of the tool call an approval lets run, as the artifact
 * that carries it, recast onto the turn; undefined for a tool the recording
 * has no result of. kagent keeps the call's earlier "requires confirmation"
 * response and adds this one.
 */
export function approvedToolResult(
  tools: readonly { name?: string }[],
  target: Omit<Target, 'endsAt'>,
): V1Object | undefined {
  const recorded = firstTask(tasksKagent4a91c273).artifacts as V1Object[];
  const result = recorded.find(artifact =>
    ((artifact.parts as V1Object[]) ?? []).some(part => {
      const data = part.data as
        { name?: string; response?: V1Object } | undefined;
      return (
        data?.response?.output !== undefined &&
        tools.some(tool => tool.name === data.name)
      );
    }),
  );
  return result
    ? recast(result, { ...target, endsAt: latestTime(result) })
    : undefined;
}

/** The questions of the ask-user turn: one with choices, one free text. */
export const FIXTURE_QUESTIONS = [
  {
    question: 'Which namespace should I look at first?',
    choices: ['kube-system', 'flux-system', 'agent-platform'],
    multiple: false,
  },
  { question: 'Is there anything I should leave alone?' },
];

/**
 * A turn waiting on the person's answers to the agent's questions: the
 * approval recording with an `ask_user` call in place of the tool call it
 * asks about, and the HITL request kagent sends for one.
 */
function askUserTask(target: Target): V1Object {
  const task = approvalTask(target);
  const [prompt] = task.history as V1Object[];
  prompt.parts = [
    {
      text: 'Some pods on the management cluster keep restarting. Find out why, and ask me where to start.',
    },
  ];
  const [call] = task.artifacts as V1Object[];
  const askId = `${target.taskId.slice(0, 8)}-ask-user`;
  const hint = FIXTURE_QUESTIONS[0].question;
  const status = task.status as V1Object & { message: V1Object };
  return {
    ...task,
    artifacts: [
      {
        ...call,
        parts: [
          {
            data: {
              id: askId,
              name: 'ask_user',
              args: { questions: FIXTURE_QUESTIONS },
            },
            metadata: { adk_is_long_running: true, adk_type: 'function_call' },
          },
        ],
      },
    ],
    status: {
      ...status,
      message: {
        ...status.message,
        parts: [{ text: hint }],
        metadata: {
          ...(status.message.metadata as V1Object),
          [HITL_EXTENSION_URI]: {
            type: 'ask_user_request',
            id: askId,
            questions: FIXTURE_QUESTIONS,
          },
        },
      },
    },
  };
}

/**
 * The prompt of a turn as the recorded stream's first frame carries it: the
 * person's message, nothing of the agent's yet.
 */
function promptTask(target: Target): V1Object {
  const [first] = streamKagent4a91c273 as { task: V1Object }[];
  return { ...recast(first.task, target), id: target.taskId };
}

/**
 * A turn the model provider refused: no reply, the provider's words on the
 * failed status (the legacy recording's, verbatim).
 */
function failedTask(target: Target): V1Object {
  const task = promptTask(target);
  return {
    ...task,
    status: {
      state: 'TASK_STATE_FAILED',
      timestamp: new Date(target.endsAt).toISOString(),
      message: agentMessage(target, `${target.taskId.slice(0, 8)}-failure`, [
        { text: failureTextOf(tasksFailed, 0) },
      ]),
    },
  };
}

/** The recorded canceled turn: stopped by the person while it wrote. */
function canceledTask(target: Target): V1Object {
  return {
    ...recast(taskCanceledKagent4a91c273 as V1Object, target),
    id: target.taskId,
  };
}

/**
 * What a turn fails with once kagent lost the session's runtime: the runtime
 * did not answer within kagent's time (the legacy recording's words, for this
 * session's runtime).
 */
export function runtimeLostText(sessionId: string): string {
  return failureTextOf(tasksRuntimeLost, 1).replace(
    /"ai-[^"]+"/,
    `"ai-${sessionId}"`,
  );
}

/** A turn sent after kagent lost the session's runtime. */
function runtimeLostTask(target: Target): V1Object {
  const task = promptTask(target);
  return {
    ...task,
    status: {
      state: 'TASK_STATE_FAILED',
      timestamp: new Date(target.endsAt).toISOString(),
      message: agentMessage(target, `${target.taskId.slice(0, 8)}-failure`, [
        { text: runtimeLostText(target.sessionId) },
      ]),
    },
  };
}

/**
 * The failure kagent reports on a session whose runtime it lost: the
 * recorded reason, and its message naming a snapshot and node of this
 * session's.
 */
export function runtimeLostFailure(sessionId: string): {
  reason: string;
  message: string;
} {
  const recorded = (sessionRuntimeLost as { session: { failure: V1Object } })
    .session.failure as { reason: string; message: string };
  return {
    reason: recorded.reason ?? RUNTIME_LOST_REASON,
    message: recorded.message.replace(
      /snapshot \S+ on node \S+/,
      `snapshot ${seededTaskId(sessionId, -1)} on node worker-${
        hashOf(sessionId) % 9
      }.example.internal`,
    ),
  };
}

/** The turns before the newest one, and the newest one, of each kind. */
const TURNS: Record<
  Exclude<SessionTurn, 'none'>,
  Array<(target: Target) => V1Object>
> = {
  completed: [completedTask],
  working: [completedTask, workingTask],
  approval: [approvalTask],
  askUser: [askUserTask],
  failed: [failedTask],
  canceled: [completedTask, canceledTask],
  runtimeLost: [completedTask, runtimeLostTask],
};

/** How long before the next turn a seeded turn ended. */
const TURN_GAP_MS = 20 * MINUTE;

/**
 * A seeded session's conversation as the kagent API v2 lists its tasks,
 * oldest first: its newest turn ends at the session's `updatedAt` in the state
 * of `session.turn`, earlier ones before it.
 */
export function conversationOf(session: FixtureSession): V1Object[] {
  if (session.turn === 'none') {
    return [];
  }
  const builders = TURNS[session.turn];
  const endsAt = Date.parse(session.updatedAt);
  return builders.map((build, position) =>
    build({
      sessionId: session.id,
      taskId: seededTaskId(session.id, position),
      agent: session.agent,
      endsAt: endsAt - (builders.length - 1 - position) * TURN_GAP_MS,
    }),
  );
}

/** What a replayed turn says, so nobody takes it for an agent's answer. */
export const FIXTURE_REPLY =
  'Fixture mode replays this reply from a recorded kagent stream: no agent read the message.';

/** The reply in the pieces the stream writes it in. */
function replyChunks(text: string): string[] {
  const words = text.split(/(?<= )/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 3) {
    chunks.push(words.slice(i, i + 3).join(''));
  }
  return chunks;
}

/** How far apart a replayed turn's frames are. */
export const FRAME_MS = 300;

/**
 * The frames of a new turn, replayed from the recorded stream: the task with
 * the person's message, the agent working, its reply written in pieces and
 * then whole, and the turn completed (or failed with `failure`, before any
 * reply). `startsAt` is when the first frame is sent; each next one follows
 * {@link FRAME_MS} later.
 */
export function streamedTurn(options: {
  sessionId: string;
  taskId: string;
  agent: Agent;
  message: { messageId: string; parts: V1Object[] };
  startsAt: number;
  reply?: string;
  failure?: string;
  /** An artifact the turn adds before its reply: the result of a tool call it ran. */
  toolResult?: V1Object;
}): V1Object[] {
  const recorded = streamKagent4a91c273 as V1Object[];
  const [snapshot, working, firstPiece, nextPiece, whole, completed] = recorded;
  const pieces = replyChunks(options.reply ?? FIXTURE_REPLY);
  const extra = options.toolResult ? 1 : 0;
  const count = options.failure ? 3 : pieces.length + 4 + extra;
  const target = {
    sessionId: options.sessionId,
    taskId: options.taskId,
    agent: options.agent,
    endsAt: options.startsAt + (count - 1) * FRAME_MS,
  };
  const at = (index: number) =>
    new Date(options.startsAt + index * FRAME_MS).toISOString();

  const task = recast(snapshot.task as V1Object, target);
  const [prompt] = task.history as V1Object[];
  const first: V1Object = {
    task: {
      ...task,
      id: options.taskId,
      history: [
        {
          ...prompt,
          messageId: options.message.messageId,
          parts: options.message.parts,
          metadata: { 'kagent.dev/timeline-position': at(0) },
        },
      ],
      metadata: {
        ...(task.metadata as V1Object),
        'kagent.dev/task-created-at': at(0),
      },
    },
  };
  const statusFrame = (
    frame: V1Object,
    index: number,
    status: V1Object,
  ): V1Object => {
    const update = recast(frame.statusUpdate as V1Object, target);
    return {
      statusUpdate: { ...update, status: { ...status, timestamp: at(index) } },
    };
  };
  const workingFrame = statusFrame(working, 1, { state: 'TASK_STATE_WORKING' });

  if (options.failure) {
    return [
      first,
      workingFrame,
      statusFrame(completed, 2, {
        state: 'TASK_STATE_FAILED',
        message: agentMessage(target, `${options.taskId.slice(0, 8)}-failure`, [
          { text: options.failure },
        ]),
      }),
    ];
  }

  const artifactFrame = (
    frame: V1Object,
    index: number,
    text: string,
  ): V1Object => {
    const update = recast(frame.artifactUpdate as V1Object, target);
    const artifact = update.artifact as V1Object;
    return {
      artifactUpdate: {
        ...update,
        artifact: {
          ...artifact,
          parts: [{ text }],
          metadata: {
            ...(artifact.metadata as V1Object),
            'kagent.dev/timeline-position': at(index),
          },
        },
      },
    };
  };
  const toolFrames: V1Object[] = options.toolResult
    ? [
        {
          artifactUpdate: {
            taskId: options.taskId,
            contextId: options.sessionId,
            artifact: {
              ...options.toolResult,
              metadata: {
                ...(options.toolResult.metadata as V1Object),
                'kagent.dev/timeline-position': at(2),
              },
            },
          },
        },
      ]
    : [];
  const replyAt = 2 + extra;
  return [
    first,
    workingFrame,
    ...toolFrames,
    ...pieces.map((piece, i) =>
      artifactFrame(i === 0 ? firstPiece : nextPiece, i + replyAt, piece),
    ),
    artifactFrame(whole, pieces.length + replyAt, pieces.join('')),
    statusFrame(completed, pieces.length + replyAt + 1, {
      state: 'TASK_STATE_COMPLETED',
    }),
  ];
}
