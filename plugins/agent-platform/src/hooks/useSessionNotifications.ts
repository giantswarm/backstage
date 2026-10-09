import { useCallback, useMemo } from 'react';
import { storageApiRef, useApi } from '@backstage/core-plugin-api';
import useObservable from 'react-use/esm/useObservable';

/**
 * One session's notification preferences, stored as a reference (not a copy)
 * so it is re-resolved against the live attention list wherever it is
 * rendered. A `type` alias on purpose: aliases get the implicit index
 * signature that makes the array satisfy the StorageApi's `JsonValue`
 * constraint.
 */
export type SessionNotificationSetting = {
  installation: string;
  sessionId: string;
  /** The bell's badge never counts a muted session. */
  muted?: boolean;
  /**
   * Epoch ms of the newest state change the user acknowledged. The session
   * reads as unread again once its state moves past this — marking read is
   * "seen this", not "never tell me again" (that is what mute is for).
   */
  readAt?: number;
};

const BUCKET = 'agent-platform';
const KEY = 'sessionNotifications';

/**
 * How long an unmuted read-marker is kept. Dropped markers only make an
 * already-settled notification unread again, so the cost of forgetting is one
 * stale dot — worth it to keep the stored list from growing with every session
 * ever acknowledged.
 */
const READ_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The composite id the sessions tables and rails already use for a row:
 * `${installation}/${sessionId}`.
 */
function toSettingId(entry: SessionNotificationSetting): string {
  return `${entry.installation}/${entry.sessionId}`;
}

function fromSettingId(
  id: string,
): Pick<SessionNotificationSetting, 'installation' | 'sessionId'> | undefined {
  // Installation names contain no slash; the session id keeps any later ones.
  const separator = id.indexOf('/');
  if (separator <= 0 || separator === id.length - 1) {
    return undefined;
  }
  return {
    installation: id.slice(0, separator),
    sessionId: id.slice(separator + 1),
  };
}

/**
 * Stored values come back from a shared bucket that older (or future) portal
 * versions also write, so every entry is checked rather than trusted.
 */
function isSetting(value: unknown): value is SessionNotificationSetting {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.installation === 'string' &&
    entry.installation.length > 0 &&
    typeof entry.sessionId === 'string' &&
    entry.sessionId.length > 0 &&
    (entry.muted === undefined || typeof entry.muted === 'boolean') &&
    (entry.readAt === undefined || typeof entry.readAt === 'number')
  );
}

/**
 * Whether an entry still says anything. One that is not muted and holds no
 * recent read-marker is indistinguishable from no entry at all, so writes
 * drop it rather than let the list grow with every session ever acknowledged.
 */
function carriesInformation(
  entry: SessionNotificationSetting,
  now: number,
): boolean {
  if (entry.muted) {
    return true;
  }
  return entry.readAt !== undefined && now - entry.readAt <= READ_RETENTION_MS;
}

export type SessionNotificationsValue = {
  /** Settings keyed by the composite `${installation}/${sessionId}`. */
  settings: Map<string, SessionNotificationSetting>;
  isMuted: (id: string) => boolean;
  toggleMute: (id: string) => Promise<void>;
  /** Epoch ms of the newest acknowledged state change, if any. */
  readAtOf: (id: string) => number | undefined;
  /**
   * Acknowledge the session's current notification. `at` is the state change
   * being acknowledged (its `changedAt`), so a later change reads as unread
   * again; it defaults to now when the summary carries no timestamp.
   */
  markRead: (id: string, at?: number) => Promise<void>;
  /** Drop the read-marker, so the session's notification reads unread again. */
  markUnread: (id: string) => Promise<void>;
  /** One write acknowledging everything currently listed. */
  markAllRead: (items: Array<{ id: string; at?: number }>) => Promise<void>;
};

/**
 * Per-session notification preferences — mute and read markers for the
 * notification bell — persisted per user through the StorageApi (bucket
 * `agent-platform`, key `sessionNotifications`). With the app's
 * `UserSettingsStorage` override that means the user-settings backend DB, so
 * the state roams across browsers and devices; under the default WebStorage
 * (tests, signed-out) the same code persists to localStorage. Same mechanism
 * and bucket as {@link usePinnedSessions}.
 *
 * Every mounted instance subscribes to the bucket's `observe$`, so a mute
 * toggled in one component updates every other one without a reload.
 *
 * What counts as "needing attention" is not stored here — the bell derives it
 * from the polled session states; this hook only remembers what the user did
 * about it.
 */
export function useSessionNotifications(): SessionNotificationsValue {
  const storageApi = useApi(storageApiRef);
  const bucket = useMemo(() => storageApi.forBucket(BUCKET), [storageApi]);

  // `observe$` emits on every change (and, for UserSettingsStorage, once with
  // the fetched value on subscription); the snapshot seeds the first render.
  const snapshot = useObservable(
    useMemo(() => bucket.observe$<SessionNotificationSetting[]>(KEY), [bucket]),
    useMemo(() => bucket.snapshot<SessionNotificationSetting[]>(KEY), [bucket]),
  );

  const entries = useMemo(
    () =>
      snapshot.presence === 'present' && Array.isArray(snapshot.value)
        ? snapshot.value.filter(isSetting)
        : [],
    [snapshot],
  );

  const settings = useMemo(() => {
    const index = new Map<string, SessionNotificationSetting>();
    for (const entry of entries) {
      index.set(toSettingId(entry), entry);
    }
    return index;
  }, [entries]);

  const isMuted = useCallback(
    (id: string) => settings.get(id)?.muted === true,
    [settings],
  );

  const readAtOf = useCallback(
    (id: string) => settings.get(id)?.readAt,
    [settings],
  );

  /**
   * Merge patches into the stored list and write it back, pruning entries that
   * no longer say anything. One write for however many patches, so "Mark all
   * read" is a single storage round-trip.
   */
  const update = useCallback(
    async (
      patches: Array<{
        id: string;
        patch: Pick<SessionNotificationSetting, 'muted' | 'readAt'>;
      }>,
    ) => {
      const now = Date.now();
      const next = new Map(settings);
      for (const { id, patch } of patches) {
        const identity = fromSettingId(id);
        if (!identity) {
          continue;
        }
        const current = next.get(id);
        const merged: SessionNotificationSetting = { ...identity };
        const muted = 'muted' in patch ? patch.muted : current?.muted;
        if (muted !== undefined) {
          merged.muted = muted;
        }
        const readAt = 'readAt' in patch ? patch.readAt : current?.readAt;
        if (readAt !== undefined) {
          merged.readAt = readAt;
        }
        next.set(id, merged);
      }
      const kept = [...next.values()].filter(entry =>
        carriesInformation(entry, now),
      );
      await bucket.set(KEY, kept);
    },
    [bucket, settings],
  );

  const toggleMute = useCallback(
    (id: string) => update([{ id, patch: { muted: !isMuted(id) } }]),
    [update, isMuted],
  );

  const markRead = useCallback(
    (id: string, at?: number) =>
      update([{ id, patch: { readAt: at ?? Date.now() } }]),
    [update],
  );

  const markUnread = useCallback(
    (id: string) => update([{ id, patch: { readAt: undefined } }]),
    [update],
  );

  const markAllRead = useCallback(
    (items: Array<{ id: string; at?: number }>) =>
      update(
        items.map(({ id, at }) => ({
          id,
          patch: { readAt: at ?? Date.now() },
        })),
      ),
    [update],
  );

  return {
    settings,
    isMuted,
    toggleMute,
    readAtOf,
    markRead,
    markUnread,
    markAllRead,
  };
}
