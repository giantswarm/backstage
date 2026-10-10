import { useCallback, useMemo } from 'react';
import { storageApiRef, useApi } from '@backstage/core-plugin-api';
import useObservable from 'react-use/esm/useObservable';

const BUCKET = 'agent-platform';
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
 * instead of flashing it for a moment on every visit.
 */
export function useDismissedHint(hintId: string) {
  const storageApi = useApi(storageApiRef);
  const bucket = useMemo(() => storageApi.forBucket(BUCKET), [storageApi]);

  // `observe$` emits on every change (and, for UserSettingsStorage, once with
  // the fetched value on subscription); the snapshot seeds the first render.
  const snapshot = useObservable(
    useMemo(() => bucket.observe$<string[]>(KEY), [bucket]),
    useMemo(() => bucket.snapshot<string[]>(KEY), [bucket]),
  );

  const ids = useMemo(
    () => (snapshot.presence === 'present' ? readIds(snapshot.value) : []),
    [snapshot],
  );

  const dismiss = useCallback(async () => {
    if (ids.includes(hintId)) {
      return;
    }
    await bucket.set(KEY, [...ids, hintId]);
  }, [bucket, hintId, ids]);

  return {
    dismissed: ids.includes(hintId),
    isKnown: snapshot.presence !== 'unknown',
    dismiss,
  };
}
