import { useCallback, useMemo } from 'react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { storedSettingWriteClient, useStoredSetting } from './useStoredSetting';

const KEY = 'dismissedHints';

/**
 * Stored values come back from a shared bucket that older (or future) portal
 * versions also write, so the list is filtered rather than trusted.
 */
function readIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id !== '')
    : [];
}

/**
 * Whether the person dismissed a one-off hint (a promo banner, a tip) for
 * good, persisted per user through the StorageApi (bucket `agent-platform`,
 * key `dismissedHints`, a list of hint ids) — the same mechanism as
 * `usePinnedSessions`. With the app's `UserSettingsStorage` override the
 * dismissal roams across browsers and devices; under the default WebStorage
 * (tests, signed-out) it lives in localStorage.
 *
 * `isKnown` stays false until the stored value has been read (the user-settings
 * backend answers asynchronously), so a caller can hold a dismissed hint back
 * instead of flashing it for a moment on every visit. The dismissal is added
 * to the latest stored list (`useStoredSetting`), so two hints dismissed in
 * quick succession both stay dismissed.
 */
export function useDismissedHint(hintId: string) {
  const { snapshot, update } = useStoredSetting(KEY);

  const ids = useMemo(
    () => (snapshot.presence === 'present' ? readIds(snapshot.value) : []),
    [snapshot],
  );

  const { mutateAsync } = useTrackedMutation(
    {
      mutationFn: () =>
        update<true>(current => {
          const stored = readIds(current);
          return stored.includes(hintId)
            ? undefined
            : { value: [...stored, hintId], result: true };
        }),
      event: null,
      untrackedReason:
        'Dismissing a hint is housekeeping of the page, not an action in the product.',
    },
    storedSettingWriteClient,
  );

  const dismiss = useCallback(async () => {
    await mutateAsync();
  }, [mutateAsync]);

  return {
    dismissed: ids.includes(hintId),
    isKnown: snapshot.presence !== 'unknown',
    dismiss,
  };
}
