import { useCallback, useMemo } from 'react';
import { storageApiRef, useApi } from '@backstage/core-plugin-api';
import useObservable from 'react-use/esm/useObservable';

/**
 * One pinned session, stored as a reference (not a copy) so it is re-resolved
 * against the live sessions list wherever it is rendered. A `type` alias on
 * purpose: aliases get the implicit index signature that makes the array
 * satisfy the StorageApi's `JsonValue` constraint.
 */
export type PinnedSession = {
  installation: string;
  sessionId: string;
};

const BUCKET = 'agent-platform';
const KEY = 'pinnedSessions';

/**
 * The composite id the sessions tables and rails already use for a row:
 * `${installation}/${sessionId}` (see e.g. SessionsTable test fixtures).
 */
function toPinnedSessionId(entry: PinnedSession): string {
  return `${entry.installation}/${entry.sessionId}`;
}

function fromPinnedSessionId(id: string): PinnedSession | undefined {
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
function isPinnedSession(value: unknown): value is PinnedSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.installation === 'string' &&
    entry.installation.length > 0 &&
    typeof entry.sessionId === 'string' &&
    entry.sessionId.length > 0
  );
}

/**
 * The sessions the user pinned, persisted per user through the StorageApi
 * (bucket `agent-platform`, key `pinnedSessions`). With the app's
 * `UserSettingsStorage` override that means the user-settings backend DB, so
 * pins roam across browsers and devices; under the default WebStorage (tests,
 * signed-out) the same code persists to localStorage.
 *
 * Every mounted instance subscribes to the bucket's `observe$`, so a pin
 * toggled in one component updates every other one without a reload.
 *
 * Ids are the composite `${installation}/${sessionId}` the session tables and
 * rails already key their rows by.
 */
export function usePinnedSessions() {
  const storageApi = useApi(storageApiRef);
  const bucket = useMemo(() => storageApi.forBucket(BUCKET), [storageApi]);

  // `observe$` emits on every change (and, for UserSettingsStorage, once with
  // the fetched value on subscription); the snapshot seeds the first render.
  const snapshot = useObservable(
    useMemo(() => bucket.observe$<PinnedSession[]>(KEY), [bucket]),
    useMemo(() => bucket.snapshot<PinnedSession[]>(KEY), [bucket]),
  );

  const entries = useMemo(
    () =>
      snapshot.presence === 'present' && Array.isArray(snapshot.value)
        ? snapshot.value.filter(isPinnedSession)
        : [],
    [snapshot],
  );

  const pinnedIds = useMemo(() => entries.map(toPinnedSessionId), [entries]);

  const isPinned = useCallback(
    (id: string) => pinnedIds.includes(id),
    [pinnedIds],
  );

  const togglePin = useCallback(
    async (id: string) => {
      const entry = fromPinnedSessionId(id);
      if (!entry) {
        return;
      }
      const next = pinnedIds.includes(id)
        ? entries.filter(pinned => toPinnedSessionId(pinned) !== id)
        : [...entries, entry];
      await bucket.set(KEY, next);
    },
    [bucket, entries, pinnedIds],
  );

  return { pinnedIds, isPinned, togglePin };
}
