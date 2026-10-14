import { useCallback, useEffect, useState } from 'react';
import {
  storageApiRef,
  useApi,
  type StorageApi,
} from '@backstage/core-plugin-api';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { storedSettingWriteClient, useStoredSetting } from './useStoredSetting';

const KEY = 'showToolActivity';

/**
 * How long the page waits for the stored choice before it goes on with the
 * default. `UserSettingsStorage` reports a failed read to the error API and
 * never emits, so without a bound an unreadable store would hold the
 * conversation back for good.
 */
export const TOOL_ACTIVITY_READ_TIMEOUT_MS = 3000;

/**
 * The last choice read per StorageApi, for the rest of the app load.
 * `UserSettingsStorage` answers every new subscription with "unknown" and a
 * fresh read, so without it each session opened would wait for that read
 * again before showing its conversation.
 */
const lastKnown = new WeakMap<StorageApi, boolean>();

type ToolActivityChange = 'shown' | 'hidden';

/**
 * Whether the session page shows the agent's tool activity (its work
 * summaries, reasoning and decided permission requests) or the conversation
 * alone, persisted per user through the StorageApi (bucket `agent-platform`,
 * key `showToolActivity`) — the same mechanism as `usePinnedSessions`, so the
 * choice follows the person across sessions, reloads and devices.
 *
 * On unless the person switched it off: only a stored `false` hides, so a
 * missing or unrecognised value reads as the page always did.
 *
 * `isKnown` stays false until the stored value has been read — or, within an
 * app load, was read before — so the page can hold the conversation back
 * instead of showing the work and then hiding it. It turns true with the
 * default after {@link TOOL_ACTIVITY_READ_TIMEOUT_MS} if the read never lands.
 *
 * The switch shows the requested value while its write is in flight:
 * `UserSettingsStorage` emits a change only once its PUT returns, and a
 * switch that springs back for a round trip reads as one that did not take.
 */
export function useShowToolActivity() {
  const storageApi = useApi(storageApiRef);
  const { snapshot, update } = useStoredSetting(KEY);

  const isRead = snapshot.presence !== 'unknown';
  const read = !(snapshot.presence === 'present' && snapshot.value === false);
  useEffect(() => {
    if (isRead) {
      lastKnown.set(storageApi, read);
    }
  }, [storageApi, isRead, read]);

  const remembered = lastKnown.get(storageApi);
  const [timedOut, setTimedOut] = useState(false);
  const isWaiting = !isRead && remembered === undefined;
  useEffect(() => {
    if (!isWaiting) {
      return undefined;
    }
    const timer = setTimeout(
      () => setTimedOut(true),
      TOOL_ACTIVITY_READ_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [isWaiting]);

  let stored = true;
  if (isRead) {
    stored = read;
  } else if (remembered !== undefined) {
    stored = remembered;
  }

  const { mutateAsync, isPending, variables } = useTrackedMutation(
    {
      mutationFn: (show: boolean) =>
        update<ToolActivityChange>(current =>
          (current !== false) === show
            ? undefined
            : { value: show, result: show ? 'shown' : 'hidden' },
        ),
      event: change =>
        change
          ? {
              name: 'AgentPlatform.toolActivityChanged',
              attributes: { change },
            }
          : null,
    },
    storedSettingWriteClient,
  );

  const setShowToolActivity = useCallback(
    async (show: boolean) => {
      await mutateAsync(show);
    },
    [mutateAsync],
  );

  return {
    showToolActivity: isPending && variables !== undefined ? variables : stored,
    isKnown: !isWaiting || timedOut,
    setShowToolActivity,
  };
}
