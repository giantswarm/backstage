import { isRecord } from '@giantswarm/backstage-plugin-agent-platform-common';
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
 * Why an export was not made, in the person's words: the bodies came back but
 * could not make a complete export. A failed request throws the client's own
 * error instead.
 */
export class SessionExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExportError';
  }
}

/**
 * The tasks route stopped before the session's last task (at most 1,000, fewer
 * for a session with large messages), so an export would be partial, and none
 * is made. `totalSize` is the session's task count when the controller said.
 */
export class SessionTooLongError extends SessionExportError {
  readonly totalSize?: number;

  constructor(totalSize?: number) {
    super('The session has more tasks than the portal reads at once.');
    this.name = 'SessionTooLongError';
    this.totalSize = totalSize;
  }
}

/**
 * A session the portal cannot read whole: recorded by an older controller,
 * its A2A context id differs from its id, and the tasks route lists by the
 * id. Its tasks would come back empty, so no export is made.
 */
export class SessionContextMismatchError extends SessionExportError {
  constructor() {
    super(
      'This session was recorded by an older version of kagent, and the portal cannot read its turns.',
    );
    this.name = 'SessionContextMismatchError';
  }
}

/** A route answered with a body the export cannot read: say so, never a file. */
function unrecognized(what: string): SessionExportError {
  return new SessionExportError(
    `The ${what} came back in a form the portal does not recognize.`,
  );
}

/**
 * The session from the session route's `{session}`. An in-band error
 * envelope is kagent's failure, not a missing session; only a well-formed
 * body without one reads as not found, the same condition as a 404.
 */
function unwrapSession(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw unrecognized('session');
  }
  if ('error' in body || 'data' in body) {
    throw typeof body.message === 'string' && body.message
      ? new SessionExportError(`kagent reported an error: ${body.message}`)
      : unrecognized('session');
  }
  if (body.session === undefined) {
    throw Object.assign(new Error('The session was not found.'), {
      name: 'NotFoundError',
      status: 404,
    });
  }
  if (!isRecord(body.session)) {
    throw unrecognized('session');
  }
  return body.session;
}

/**
 * The Session export of two route bodies, or a throw when they cannot make a
 * complete one.
 *
 * Nothing in `session` or `tasks` is read or changed beyond what deciding
 * that takes: they are unwrapped from their routes' envelopes and nothing
 * else. proto3 JSON leaves out an empty list and a zero, so a session that
 * has never run comes back with neither `tasks` nor `totalSize`.
 *
 * The read is cut when the route kept a page token it did not follow, or
 * when kagent's count is larger than what came back; the token is the sign
 * that does not depend on the controller filling `total_size`.
 */
export function buildSessionExport(
  { sessionBody, tasksBody }: RawSessionBodies,
  installation: string,
  now: Date,
): SessionExport {
  const session = unwrapSession(sessionBody);
  if (
    typeof session.contextId === 'string' &&
    session.contextId !== '' &&
    session.contextId !== session.id
  ) {
    throw new SessionContextMismatchError();
  }

  // An older envelope (`{error, data}`) has no `tasks` and would otherwise
  // read as a session that has never run. Any other key is let through, so
  // a field kagent adds later does not stop every export.
  if (!isRecord(tasksBody) || 'error' in tasksBody || 'data' in tasksBody) {
    throw unrecognized('session’s tasks');
  }
  const tasks = tasksBody.tasks ?? [];
  const totalSize = tasksBody.totalSize ?? 0;
  const nextPageToken = tasksBody.nextPageToken ?? '';
  if (
    !Array.isArray(tasks) ||
    typeof totalSize !== 'number' ||
    typeof nextPageToken !== 'string'
  ) {
    throw unrecognized('session’s tasks');
  }
  if (nextPageToken !== '' || totalSize > tasks.length) {
    throw new SessionTooLongError(
      totalSize > tasks.length ? totalSize : undefined,
    );
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
