/**
 * The person's notification record for the Agent Platform: the facts kagent
 * cannot hold about a session (who started it, how much the person wants to
 * hear from it) and what the person has already seen. Kept in the shell's
 * roaming store, the `agent-platform` bucket of the user-settings backend, as
 * two keys, so the frequent seen-mark writes never rewrite the rarely changed
 * settings:
 *
 * - {@link NOTIFICATION_SETTINGS_KEY}: per (installation, session), whether
 *   the portal started it and its Notification level;
 * - {@link NOTIFICATION_SEEN_KEY}: per (installation, session), and per
 *   installation for its MCP sign-in row, the seen mark of the last row the
 *   person has seen.
 *
 * Pure functions over the stored JSON; `useSessionNotificationRecord` reads
 * and writes them. The storage writes one whole value per key, last write
 * wins, so every change here is applied to the latest stored value.
 *
 * Nothing in the record is written by the agent or the person: no session
 * title, no conversation text. A seen mark is the inbox's row identity, built
 * from the installation, the session id, the row kind and a time.
 */

export const NOTIFICATION_SETTINGS_KEY = 'sessionNotificationSettings';
export const NOTIFICATION_SEEN_KEY = 'notificationSeenMarks';

/**
 * How much a person wants to hear from one session. `default`: it notifies
 * when it waits for them or fails. `all`: also when a turn finishes.
 * `muted`: never. A session without a stored level is at `default`.
 */
export type NotificationLevel = 'default' | 'all' | 'muted';

export const NOTIFICATION_LEVELS: readonly NotificationLevel[] = [
  'default',
  'all',
  'muted',
];

/**
 * One session's settings. A `type` alias on purpose, as everything stored
 * here: aliases get the implicit index signature that satisfies the
 * StorageApi's `JsonValue` constraint.
 *
 * `at` is when the entry was last written (ms since the epoch), so a sessions
 * read that left before the session was started cannot prune it.
 */
export type SessionNotificationSettings = {
  /** Present only when the portal's `start_session` started the session. */
  origin?: 'portal';
  /** Absent means `default`. */
  level?: 'all' | 'muted';
  at: number;
};

/** The settings key's value: entries by `${installation}/${sessionId}`. */
export type NotificationSettingsValue = {
  sessions: Record<string, SessionNotificationSettings>;
};

/** A seen mark: the identity of the last row the person has seen. */
export type StoredSeenMark = {
  mark: string;
  at: number;
};

/** The seen key's value. */
export type NotificationSeenValue = {
  /** By `${installation}/${sessionId}`. */
  sessions: Record<string, StoredSeenMark>;
  /** The MCP sign-in row's, by installation. */
  mcpSignIn: Record<string, StoredSeenMark>;
};

/** What the inbox marks as seen. */
export type SeenMarkTarget =
  | { kind: 'session'; installation: string; sessionId: string; mark: string }
  | { kind: 'mcpSignIn'; installation: string; mark: string };

/**
 * At most this many session seen marks are kept, the newest by write time. A
 * row exists only for the sessions the session-state reader evaluates (the 20
 * most recent per installation), so the oldest marks belong to sessions that
 * can have no row; the cap keeps the value well under the user-settings
 * backend's 100 kB request limit however long the person keeps their sessions.
 */
export const MAX_SESSION_SEEN_MARKS = 200;

/**
 * How old an entry must be before a sessions read that does not list its
 * session prunes it. A read can leave before a session is started and answer
 * after, and the time is the writing device's clock; pruning a deleted
 * session's entry a while later costs nothing.
 */
export const PRUNE_GRACE_MS = 10 * 60 * 1000;

/** The id the session tables and rails already key a row by. */
export function sessionKey(installation: string, sessionId: string): string {
  return `${installation}/${sessionId}`;
}

function installationOf(key: string): string {
  // Installation names contain no slash; the session id keeps any later ones.
  return key.slice(0, key.indexOf('/'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSessionKey(key: string): boolean {
  const separator = key.indexOf('/');
  return separator > 0 && separator < key.length - 1;
}

/**
 * The stored settings, entry by entry: a shared bucket that older (or future)
 * portal versions also write, so every entry is checked rather than trusted,
 * and one malformed entry costs only itself.
 */
export function readNotificationSettings(
  value: unknown,
): NotificationSettingsValue {
  const sessions: Record<string, SessionNotificationSettings> = {};
  const stored =
    isRecord(value) && isRecord(value.sessions) ? value.sessions : {};
  for (const [key, entry] of Object.entries(stored)) {
    if (!isSessionKey(key) || !isRecord(entry) || !isTime(entry.at)) {
      continue;
    }
    const parsed: SessionNotificationSettings = { at: entry.at };
    if (entry.origin === 'portal') {
      parsed.origin = 'portal';
    }
    if (entry.level === 'all' || entry.level === 'muted') {
      parsed.level = entry.level;
    }
    if (parsed.origin || parsed.level) {
      sessions[key] = parsed;
    }
  }
  return { sessions };
}

function readMarks(value: unknown, isKey: (key: string) => boolean) {
  const marks: Record<string, StoredSeenMark> = {};
  if (!isRecord(value)) {
    return marks;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      isKey(key) &&
      isRecord(entry) &&
      typeof entry.mark === 'string' &&
      entry.mark !== '' &&
      isTime(entry.at)
    ) {
      marks[key] = { mark: entry.mark, at: entry.at };
    }
  }
  return marks;
}

/** The stored seen marks, checked entry by entry like the settings. */
export function readNotificationSeen(value: unknown): NotificationSeenValue {
  const stored = isRecord(value) ? value : {};
  return {
    sessions: readMarks(stored.sessions, isSessionKey),
    mcpSignIn: readMarks(stored.mcpSignIn, key => key !== ''),
  };
}

/** A session's Notification level: `default` when it has no entry. */
export function levelOf(
  settings: NotificationSettingsValue,
  installation: string,
  sessionId: string,
): NotificationLevel {
  return (
    settings.sessions[sessionKey(installation, sessionId)]?.level ?? 'default'
  );
}

/**
 * Whether the portal started the session. A session without an entry (started
 * from Slack, or before the record existed) was not, and neither was one whose
 * entry only holds the level it was muted with.
 */
export function isPortalStarted(
  settings: NotificationSettingsValue,
  installation: string,
  sessionId: string,
): boolean {
  return (
    settings.sessions[sessionKey(installation, sessionId)]?.origin === 'portal'
  );
}

/**
 * The settings with one session's level set, or undefined when it already
 * has that level. Setting `default` drops the stored level, and the entry
 * with it unless the portal started the session; muting a session without an
 * entry creates one that does not make it portal-started.
 */
export function withLevel(
  settings: NotificationSettingsValue,
  installation: string,
  sessionId: string,
  level: NotificationLevel,
  now: number,
): NotificationSettingsValue | undefined {
  if (levelOf(settings, installation, sessionId) === level) {
    return undefined;
  }
  const key = sessionKey(installation, sessionId);
  const { [key]: current, ...others } = settings.sessions;
  const entry: SessionNotificationSettings = { at: now };
  if (current?.origin) {
    entry.origin = current.origin;
  }
  if (level !== 'default') {
    entry.level = level;
  }
  return {
    sessions:
      entry.origin || entry.level ? { ...others, [key]: entry } : others,
  };
}

/**
 * The settings with the session recorded as started in the portal, or
 * undefined when it already is. Keeps a level set before (it cannot be, for
 * a session that has just started, but the record does not depend on that).
 */
export function withPortalStarted(
  settings: NotificationSettingsValue,
  installation: string,
  sessionId: string,
  now: number,
): NotificationSettingsValue | undefined {
  if (isPortalStarted(settings, installation, sessionId)) {
    return undefined;
  }
  const key = sessionKey(installation, sessionId);
  const current = settings.sessions[key];
  return {
    sessions: {
      ...settings.sessions,
      [key]: {
        origin: 'portal',
        ...(current?.level && { level: current.level }),
        at: now,
      },
    },
  };
}

/** The seen mark stored for a session, if any. */
export function sessionSeenMarkOf(
  seen: NotificationSeenValue,
  installation: string,
  sessionId: string,
): string | undefined {
  return seen.sessions[sessionKey(installation, sessionId)]?.mark;
}

/** The seen mark stored for an installation's MCP sign-in row, if any. */
export function mcpSignInSeenMarkOf(
  seen: NotificationSeenValue,
  installation: string,
): string | undefined {
  return seen.mcpSignIn[installation]?.mark;
}

/** Whether the person has seen the row `target` names, by its mark. */
export function isSeen(
  seen: NotificationSeenValue,
  target: SeenMarkTarget,
): boolean {
  return target.kind === 'session'
    ? sessionSeenMarkOf(seen, target.installation, target.sessionId) ===
        target.mark
    : mcpSignInSeenMarkOf(seen, target.installation) === target.mark;
}

/** The newest {@link MAX_SESSION_SEEN_MARKS} session marks. */
function capped(
  sessions: Record<string, StoredSeenMark>,
): Record<string, StoredSeenMark> {
  const entries = Object.entries(sessions);
  if (entries.length <= MAX_SESSION_SEEN_MARKS) {
    return sessions;
  }
  return Object.fromEntries(
    entries
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, MAX_SESSION_SEEN_MARKS),
  );
}

/**
 * The seen marks with every target marked, in one value (so "Mark all read"
 * is one write), or undefined when each already carries its mark.
 */
export function withSeen(
  seen: NotificationSeenValue,
  targets: readonly SeenMarkTarget[],
  now: number,
): NotificationSeenValue | undefined {
  const pending = targets.filter(
    target => target.mark !== '' && !isSeen(seen, target),
  );
  if (pending.length === 0) {
    return undefined;
  }
  const sessions = { ...seen.sessions };
  const mcpSignIn = { ...seen.mcpSignIn };
  for (const target of pending) {
    const stored = { mark: target.mark, at: now };
    if (target.kind === 'session') {
      sessions[sessionKey(target.installation, target.sessionId)] = stored;
    } else {
      mcpSignIn[target.installation] = stored;
    }
  }
  return { sessions: capped(sessions), mcpSignIn };
}

/**
 * One installation's complete, successful sessions read: every session the
 * person has there, and when it answered. Only such a read may prune.
 */
export type CompleteSessionsRead = {
  installation: string;
  sessionIds: readonly string[];
  /** When the read answered (ms since the epoch). */
  readAt: number;
};

/**
 * The entries of `entries` the read lets go: the read's installation's
 * entries for sessions it does not list, written well before it answered.
 * An empty read prunes nothing: a list that came back empty is too often a
 * response that could not be read (the client resolves an unparseable body
 * as no sessions) to wipe an installation's entries on.
 */
function prunable(
  entries: Record<string, { at: number }>,
  read: CompleteSessionsRead,
): string[] {
  if (read.sessionIds.length === 0) {
    return [];
  }
  const live = new Set(
    read.sessionIds.map(id => sessionKey(read.installation, id)),
  );
  return Object.entries(entries)
    .filter(
      ([key, entry]) =>
        installationOf(key) === read.installation &&
        !live.has(key) &&
        entry.at < read.readAt - PRUNE_GRACE_MS,
    )
    .map(([key]) => key);
}

function without<T>(
  entries: Record<string, T>,
  keys: readonly string[],
): Record<string, T> {
  const drop = new Set(keys);
  return Object.fromEntries(
    Object.entries(entries).filter(([key]) => !drop.has(key)),
  );
}

/** The settings without the entries `read` prunes, or undefined if none. */
export function prunedSettings(
  settings: NotificationSettingsValue,
  read: CompleteSessionsRead,
): NotificationSettingsValue | undefined {
  const keys = prunable(settings.sessions, read);
  return keys.length === 0
    ? undefined
    : { sessions: without(settings.sessions, keys) };
}

/**
 * The seen marks without the session marks `read` prunes, or undefined if
 * none. The MCP sign-in marks are per installation and stay.
 */
export function prunedSeen(
  seen: NotificationSeenValue,
  read: CompleteSessionsRead,
): NotificationSeenValue | undefined {
  const keys = prunable(seen.sessions, read);
  return keys.length === 0
    ? undefined
    : { sessions: without(seen.sessions, keys), mcpSignIn: seen.mcpSignIn };
}
