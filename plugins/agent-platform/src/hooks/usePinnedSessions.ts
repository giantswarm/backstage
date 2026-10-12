import { useCallback, useMemo } from 'react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { storedSettingWriteClient, useStoredSetting } from './useStoredSetting';

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

type PinChange = 'pinned' | 'unpinned';

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

function readPins(value: unknown): PinnedSession[] {
  return Array.isArray(value) ? value.filter(isPinnedSession) : [];
}

/**
 * The sessions the user pinned, persisted per user through the StorageApi
 * (bucket `agent-platform`, key `pinnedSessions`). With the app's
 * `UserSettingsStorage` override that means the user-settings backend DB, so
 * pins roam across browsers and devices; under the default WebStorage (tests,
 * signed-out) the same code persists to localStorage.
 *
 * Every mounted instance subscribes to the bucket's `observe$`, so a pin
 * toggled in one component updates every other one without a reload. A toggle
 * is applied to the latest stored list (`useStoredSetting`), so toggles in
 * quick succession all land, and reports `AgentPlatform.sessionPinChanged`.
 *
 * Ids are the composite `${installation}/${sessionId}` the session tables and
 * rails already key their rows by.
 */
export function usePinnedSessions() {
  const { snapshot, update } = useStoredSetting(KEY);

  const entries = useMemo(
    () => readPins(snapshot.presence === 'present' ? snapshot.value : []),
    [snapshot],
  );

  const pinnedIds = useMemo(() => entries.map(toPinnedSessionId), [entries]);

  const isPinned = useCallback(
    (id: string) => pinnedIds.includes(id),
    [pinnedIds],
  );

  const { mutateAsync } = useTrackedMutation(
    {
      mutationFn: (id: string) =>
        update<PinChange>(current => {
          const entry = fromPinnedSessionId(id);
          if (!entry) {
            return undefined;
          }
          const pins = readPins(current);
          return pins.some(pinned => toPinnedSessionId(pinned) === id)
            ? {
                value: pins.filter(pinned => toPinnedSessionId(pinned) !== id),
                result: 'unpinned',
              }
            : { value: [...pins, entry], result: 'pinned' };
        }),
      event: change =>
        change
          ? {
              name: 'AgentPlatform.sessionPinChanged',
              attributes: { change },
            }
          : null,
    },
    storedSettingWriteClient,
  );

  const togglePin = useCallback(
    async (id: string) => {
      await mutateAsync(id);
    },
    [mutateAsync],
  );

  return { pinnedIds, isPinned, togglePin };
}
