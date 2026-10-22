import type { RawSessionBodies } from '../apis/types';

/**
 * The Session export format's version, raised on any change a reader would
 * have to know about. The format is described in
 * `docs/agent-platform-session-export.md`.
 */
export const SESSION_EXPORT_FORMAT_VERSION = 1;

/** A Session export: one session and all of its tasks, as kagent stores them. */
export type SessionExport = {
  formatVersion: typeof SESSION_EXPORT_FORMAT_VERSION;
  /** When the file was made, as an RFC 3339 UTC timestamp. */
  exportedAt: string;
  /** The installation the session runs on, from the session page's route. */
  installation: string;
  /** kagent's `Session`, verbatim: the session route's `session`. */
  session: Record<string, unknown>;
  /** kagent's A2A tasks, verbatim and oldest first: the tasks route's `tasks`. */
  tasks: unknown[];
};

/**
 * The tasks route read fewer tasks than the session has (it stops at 1,000),
 * so an export would be partial, and none is made.
 */
export class SessionTooLongError extends Error {
  readonly totalSize: number;

  constructor(totalSize: number) {
    super(`The session has ${totalSize} tasks, more than the portal reads.`);
    this.name = 'SessionTooLongError';
    this.totalSize = totalSize;
  }
}

/**
 * The keys of `ListTasksResponse` in proto3 JSON. A body with any other key is
 * not the tasks route's answer: an older envelope (`{error, data}`) has no
 * `tasks`, and would otherwise read as a session that has never run.
 */
const LIST_TASKS_KEYS = new Set([
  'tasks',
  'nextPageToken',
  'pageSize',
  'totalSize',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The Session export of two route bodies, or a throw when they cannot make a
 * complete one.
 *
 * Nothing in `session` or `tasks` is read or changed: they are unwrapped from
 * their routes' envelopes and nothing else. A body without a session is the
 * same condition as a 404 and throws as one. proto3 JSON leaves out an empty
 * list and a zero, so a session that has never run comes back with neither
 * `tasks` nor `totalSize`.
 */
export function buildSessionExport(
  { sessionBody, tasksBody }: RawSessionBodies,
  installation: string,
  now: Date,
): SessionExport {
  const session = isRecord(sessionBody) ? sessionBody.session : undefined;
  if (!isRecord(session)) {
    throw Object.assign(new Error('The session was not found.'), {
      name: 'NotFoundError',
    });
  }

  const taskList =
    isRecord(tasksBody) &&
    Object.keys(tasksBody).every(key => LIST_TASKS_KEYS.has(key))
      ? tasksBody
      : undefined;
  const tasks = taskList ? (taskList.tasks ?? []) : undefined;
  const totalSize = taskList ? (taskList.totalSize ?? 0) : undefined;
  if (!Array.isArray(tasks) || typeof totalSize !== 'number') {
    throw new Error(
      'The session’s tasks came back in a form the portal does not recognize.',
    );
  }
  if (totalSize > tasks.length) {
    throw new SessionTooLongError(totalSize);
  }

  return {
    formatVersion: SESSION_EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    installation,
    session,
    tasks,
  };
}

/**
 * Letters, digits, `_` and `-` only, so any file system takes it. Case is
 * kept: a session id is opaque, and folding it could name another session.
 */
function fileNamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * The export's file name, from the agent's name and the session id:
 * `<agent>-session-<id>.json`, or `session-<id>.json` with no agent name.
 */
export function sessionExportFileName(
  agentName: string | undefined,
  sessionId: string,
): string {
  const agent = agentName ? fileNamePart(agentName) : '';
  const session = `session-${fileNamePart(sessionId)}`;
  return `${agent ? `${agent}-` : ''}${session}.json`;
}
