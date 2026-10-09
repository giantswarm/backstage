import { useCallback, useMemo } from 'react';
import { storageApiRef, useApi } from '@backstage/core-plugin-api';
import useObservable from 'react-use/esm/useObservable';

const BUCKET = 'agent-platform';
const KEY = 'chatTechnicalDetails';

/**
 * Whether the chat shows the technical trace — exact tool names, arguments and
 * results — instead of the plain, readable one.
 *
 * One setting for the whole session view, persisted per user through the
 * StorageApi (bucket `agent-platform`, key `chatTechnicalDetails`) — the same
 * store the pinned sessions use, so with the app's `UserSettingsStorage`
 * override it roams across browsers and devices, and under the default
 * WebStorage it persists to localStorage.
 *
 * Plain is the default: the readable trace is what most readers want, and the
 * people who want raw payloads flip the switch once and keep it.
 */
export function useChatTechnicalDetails() {
  const storageApi = useApi(storageApiRef);
  const bucket = useMemo(() => storageApi.forBucket(BUCKET), [storageApi]);

  // `observe$` emits on every change (and, for UserSettingsStorage, once with
  // the fetched value on subscription); the snapshot seeds the first render.
  const snapshot = useObservable(
    useMemo(() => bucket.observe$<boolean>(KEY), [bucket]),
    useMemo(() => bucket.snapshot<boolean>(KEY), [bucket]),
  );

  // Anything but a stored `true` reads as plain — the bucket is shared with
  // other portal versions, so the value is checked rather than trusted.
  const isTechnical =
    snapshot.presence === 'present' && snapshot.value === true;

  const setTechnical = useCallback(
    (value: boolean) => {
      // Fire and forget: the observable delivers the new value to every
      // mounted consumer, and a failed persist only loses the preference.
      bucket.set(KEY, value).catch(() => {});
    },
    [bucket],
  );

  return { isTechnical, setTechnical };
}
