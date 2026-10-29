import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  storageApiRef,
  useApi,
  type StorageApi,
  type StorageValueSnapshot,
} from '@backstage/core-plugin-api';
import { QueryClient } from '@tanstack/react-query';

/** What a StorageApi bucket stores. */
export type StoredJson = Parameters<StorageApi['set']>[1];

/**
 * The client the settings writes' `useTrackedMutation`s run on. They are
 * called from the shared header and the shell's nav too, outside the plugin's
 * `QueryClientProvider`, and keep no cache of their own.
 */
export const storedSettingWriteClient = new QueryClient({
  defaultOptions: { mutations: { gcTime: 0, retry: false } },
});

const BUCKET = 'agent-platform';

/** How long a write waits for the stored value before it gives up. */
const READ_TIMEOUT_MS = 10_000;

/** The queue of writes to one setting. */
const queues = new WeakMap<StorageApi, Map<string, Promise<unknown>>>();

function tailOf(storageApi: StorageApi, key: string): Promise<unknown> {
  return queues.get(storageApi)?.get(key) ?? Promise.resolve();
}

function setTail(storageApi: StorageApi, key: string, tail: Promise<unknown>) {
  let byKey = queues.get(storageApi);
  if (!byKey) {
    byKey = new Map();
    queues.set(storageApi, byKey);
  }
  byKey.set(key, tail);
}

/**
 * The value stored now. A storage that knows it synchronously (browser
 * storage, in tests and signed out) answers from its snapshot; the app's
 * user-settings storage answers `snapshot` with "unknown", and a subscription
 * reads the backend afresh. A read the backend did not answer ("unknown")
 * rejects: a write built on it would replace the stored value.
 */
function readStored(
  bucket: StorageApi,
  key: string,
): Promise<StorageValueSnapshot<StoredJson>> {
  const known = bucket.snapshot<StoredJson>(key);
  if (known.presence !== 'unknown') {
    return Promise.resolve(known);
  }
  return new Promise((resolve, reject) => {
    const state: {
      settled: boolean;
      timer?: ReturnType<typeof setTimeout>;
      subscription?: { unsubscribe(): void };
    } = { settled: false };
    const settle = (finish: () => void) => {
      if (state.settled) {
        return;
      }
      state.settled = true;
      clearTimeout(state.timer);
      finish();
      // A value can arrive synchronously on subscribe, before the
      // subscription is assigned.
      queueMicrotask(() => state.subscription?.unsubscribe());
    };
    const unreadable = () =>
      reject(new Error('The stored setting could not be read.'));
    state.timer = setTimeout(() => settle(unreadable), READ_TIMEOUT_MS);
    state.subscription = bucket.observe$<StoredJson>(key).subscribe({
      next: value =>
        settle(() =>
          value.presence === 'unknown' ? unreadable() : resolve(value),
        ),
      error: error => settle(() => reject(error)),
    });
  });
}

/**
 * Applies `apply` to the value stored now and stores what it returns; nothing
 * is written when it returns undefined. Resolves with `apply`'s result.
 *
 * Every write reads the stored value first, never a value a component holds:
 * the storage writes one whole value per key, last write wins, so a write
 * built on a stale or a failed read (a tab that just woke up, offline) would
 * replace what other tabs and devices stored since. Writes to one key are
 * queued across the app, so quick changes in one tab each start from the one
 * before (R2-5). Two tabs writing within one read-and-write still race; the
 * backend offers no compare-and-set.
 */
function updateStoredSetting<R>(
  storageApi: StorageApi,
  key: string,
  apply: (current: unknown) => { value: StoredJson; result: R } | undefined,
): Promise<R | undefined> {
  const bucket = storageApi.forBucket(BUCKET);
  const run = async (): Promise<R | undefined> => {
    const stored = await readStored(bucket, key);
    const change = apply(
      stored.presence === 'present' ? stored.value : undefined,
    );
    if (!change) {
      return undefined;
    }
    await bucket.set(key, change.value);
    return change.result;
  };
  const done = tailOf(storageApi, key).then(run);
  // The queue goes on whether or not this write failed.
  setTail(
    storageApi,
    key,
    done.catch(() => {}),
  );
  return done;
}

/** Writes to one setting of the `agent-platform` bucket, without reading it. */
export function useStoredSettingUpdate(key: string) {
  const storageApi = useApi(storageApiRef);
  return useCallback(
    <R>(
      apply: (current: unknown) => { value: StoredJson; result: R } | undefined,
    ) => updateStoredSetting(storageApi, key, apply),
    [storageApi, key],
  );
}

function isSameSnapshot(
  a: StorageValueSnapshot<StoredJson>,
  b: StorageValueSnapshot<StoredJson>,
): boolean {
  if (a.presence !== b.presence) {
    return false;
  }
  if (a.presence !== 'present') {
    return true;
  }
  // Values of the stored JSON, small and acyclic; a different key order only
  // costs a re-render.
  return JSON.stringify(a.value) === JSON.stringify(b.value);
}

export type StoredSettingOptions = {
  /**
   * Read the stored value again whenever the tab becomes visible. For values
   * other tabs and devices write often (the notifications' seen marks): the
   * signals API carries a change to an open tab, and this catches up a tab
   * that was hidden, asleep or offline when it was announced.
   */
  rereadWhenVisible?: boolean;
};

/**
 * Counts the times the tab became visible again, while `enabled`; 0 otherwise.
 */
function useVisibleAgainCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const onChange = () => {
      if (document.visibilityState === 'visible') {
        setCount(previous => previous + 1);
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [enabled]);
  return count;
}

/**
 * One per-user setting of the `agent-platform` bucket, read through the
 * StorageApi's subscription and written as a functional update
 * (`updateStoredSetting`: each write reads the stored value first).
 *
 * A read the backend did not answer arrives as "unknown"; once a value is
 * known it stays shown until a read answers, so a tab that wakes up offline
 * keeps what it had rather than showing everything as unset.
 */
export function useStoredSetting(
  key: string,
  { rereadWhenVisible = false }: StoredSettingOptions = {},
) {
  const storageApi = useApi(storageApiRef);
  const bucket = useMemo(() => storageApi.forBucket(BUCKET), [storageApi]);
  const visibleAgain = useVisibleAgainCount(rereadWhenVisible);

  const [snapshot, setSnapshot] = useState(() =>
    bucket.snapshot<StoredJson>(key),
  );

  // `observe$` emits on every change (and, for the app's user-settings
  // storage, with a fresh read on subscription). A new subscription is what
  // reads the backend again, so a tab that became visible subscribes afresh.
  useEffect(() => {
    const subscription = bucket.observe$<StoredJson>(key).subscribe(next =>
      setSnapshot(previous => {
        if (next.presence === 'unknown' && previous.presence !== 'unknown') {
          return previous;
        }
        // A write hands out the same value up to three times (its fresh
        // read, its own answer, the signal's re-read), each a new object.
        // Keeping the one shown spares every reader a re-render for
        // nothing: on the session page that re-rendered the page and its
        // header actions.
        return isSameSnapshot(previous, next) ? previous : next;
      }),
    );
    return () => subscription.unsubscribe();
  }, [bucket, key, visibleAgain]);

  const update = useStoredSettingUpdate(key);

  return { snapshot, update };
}
