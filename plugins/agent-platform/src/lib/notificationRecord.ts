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
 * `at` is when the entry was last written (ms since the epoch): which entries
 * are the newest, when the record is bounded.
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
 * At most this many session seen marks are kept per installation, the newest
 * by the time they were written. A row exists only for the sessions the
 * session-state reader evaluates, the 20 most recent per installation. While
 * a session stays among them, at most 19 others were among them when its mark
 * was written, and at most 20 can join after it before it drops out: so no
 * more than 39 other marks of its installation can be newer than a mark whose
 * row still shows. 40 keeps every such mark; marks of sessions that dropped
 * out can go. It also bounds the value (about 160 bytes a mark) well under
 * the user-settings backend's 100 kB request limit.
 */
export const SEEN_MARKS_PER_INSTALLATION = 40;

/**
 * At most this many entries that only record a portal start are kept per
 * installation, the newest by start. Entries with a level the person chose
 * are always kept. An entry is about 85 bytes, so this bounds the value under
 * the user-settings backend's 100 kB request limit for a person working on a
 * few installations. A session started before its installation's newest 200
 * that is still in use loses its Failed and Turn finished notifications; its
 * Waiting ones stay.
 */
export const PORTAL_STARTS_PER_INSTALLATION = 200;

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
    sessions: newestPerInstallation(
      {
        ...settings.sessions,
        [key]: {
          origin: 'portal',
          ...(current?.level && { level: current.level }),
          at: now,
        },
      },
      PORTAL_STARTS_PER_INSTALLATION,
      // An entry with a level the person chose is never dropped.
      entry => entry.level === undefined,
    ),
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

/**
 * `entries` with at most `limit` of each installation's droppable entries,
 * the newest by `at`; entries `droppable` says no to are all kept.
 */
function newestPerInstallation<T extends { at: number }>(
  entries: Record<string, T>,
  limit: number,
  droppable: (entry: T) => boolean = () => true,
): Record<string, T> {
  const byInstallation = new Map<string, Array<[string, T]>>();
  for (const [key, entry] of Object.entries(entries)) {
    if (droppable(entry)) {
      const installation = installationOf(key);
      byInstallation.set(installation, [
        ...(byInstallation.get(installation) ?? []),
        [key, entry],
      ]);
    }
  }
  const dropped = new Set<string>();
  for (const candidates of byInstallation.values()) {
    candidates
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(limit)
      .forEach(([key]) => dropped.add(key));
  }
  return dropped.size === 0 ? entries : without(entries, [...dropped]);
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
  return {
    sessions: newestPerInstallation(sessions, SEEN_MARKS_PER_INSTALLATION),
    mcpSignIn,
  };
}

/**
 * The seen marks with `target` marked, only while the stored mark of its row
 * is still `previous`, or undefined when it is not (another tab or device has
 * written since `previous` was read) or already carries `target`'s mark.
 */
export function withSeenReplaced(
  seen: NotificationSeenValue,
  target: SeenMarkTarget,
  previous: string,
  now: number,
): NotificationSeenValue | undefined {
  const stored =
    target.kind === 'session'
      ? sessionSeenMarkOf(seen, target.installation, target.sessionId)
      : mcpSignInSeenMarkOf(seen, target.installation);
  return stored === previous ? withSeen(seen, [target], now) : undefined;
}

/** The keys of `entries` that belong to `installation`. */
export function sessionKeysOf(
  entries: Record<string, unknown>,
  installation: string,
): string[] {
  return Object.keys(entries).filter(
    key => installationOf(key) === installation,
  );
}

/**
 * Pruning, without comparing clocks: `known` are the entry keys the record
 * held for `installation` before a complete sessions read of it started, and
 * `liveSessionIds` that read's sessions. An entry is written only for a
 * session that exists (after `start_session` answered, or from a list that
 * showed it), so a known entry's session existed when the read started: if
 * the read does not list it, it was deleted. Entries written since are
 * outside `known` and stay.
 */
export type PruneInput = {
  installation: string;
  known: ReadonlySet<string>;
  liveSessionIds: readonly string[];
};

function prunable(
  entries: Record<string, unknown>,
  { installation, known, liveSessionIds }: PruneInput,
): string[] {
  const live = new Set(liveSessionIds.map(id => sessionKey(installation, id)));
  return sessionKeysOf(entries, installation).filter(
    key => known.has(key) && !live.has(key),
  );
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

/** The settings without the entries of deleted sessions, or undefined if none. */
export function prunedSettings(
  settings: NotificationSettingsValue,
  input: PruneInput,
): NotificationSettingsValue | undefined {
  const keys = prunable(settings.sessions, input);
  return keys.length === 0
    ? undefined
    : { sessions: without(settings.sessions, keys) };
}

/**
 * The seen marks without the marks of deleted sessions, or undefined if none.
 * The MCP sign-in marks are per installation and stay.
 */
export function prunedSeen(
  seen: NotificationSeenValue,
  input: PruneInput,
): NotificationSeenValue | undefined {
  const keys = prunable(seen.sessions, input);
  return keys.length === 0
    ? undefined
    : { sessions: without(seen.sessions, keys), mcpSignIn: seen.mcpSignIn };
}
