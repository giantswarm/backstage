import { useCallback } from 'react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { storedSettingWriteClient, useStoredSetting } from './useStoredSetting';

const KEY = 'showToolActivity';

type ToolActivityChange = 'shown' | 'hidden';

/**
 * Whether the session page shows the agent's tool activity (its work
 * summaries, reasoning and permission requests) or the conversation alone,
 * persisted per user through the StorageApi (bucket `agent-platform`, key
 * `showToolActivity`) — the same mechanism as `usePinnedSessions`, so the
 * choice follows the person across sessions, reloads and devices.
 *
 * On unless the person switched it off: only a stored `false` hides, so a
 * missing, unread or unrecognised value reads as the page always did.
 *
 * The switch shows the requested value while its write is in flight:
 * `UserSettingsStorage` emits a change only once its PUT returns, and a
 * switch that springs back for a round trip reads as one that did not take.
 */
export function useShowToolActivity() {
  const { snapshot, update } = useStoredSetting(KEY);
  const stored = !(snapshot.presence === 'present' && snapshot.value === false);

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
    setShowToolActivity,
  };
}
