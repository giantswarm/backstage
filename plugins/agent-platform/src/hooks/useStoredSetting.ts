import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  storageApiRef,
  useApi,
  type StorageApi,
  type StorageValueSnapshot,
} from '@backstage/core-plugin-api';
import { QueryClient } from '@tanstack/react-query';
import useObservable from 'react-use/esm/useObservable';

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

/**
 * The writes to one setting: queued, and the value the newest of them stored
 * until the bucket's subscription has caught up with it.
 */
type Slot = {
  tail: Promise<unknown>;
  pending: number;
  written?: { value: unknown };
};

const slots = new WeakMap<StorageApi, Map<string, Slot>>();

function slotOf(storageApi: StorageApi, key: string): Slot {
  let byKey = slots.get(storageApi);
  if (!byKey) {
    byKey = new Map();
    slots.set(storageApi, byKey);
  }
  let slot = byKey.get(key);
  if (!slot) {
    slot = { tail: Promise.resolve(), pending: 0 };
    byKey.set(key, slot);
  }
  return slot;
}

/**
 * The stored value when the caller has not seen one yet: `UserSettingsStorage`
 * answers `snapshot` with "unknown" and reads through its subscription.
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
    state.timer = setTimeout(
      () =>
        settle(() =>
          reject(new Error('The stored setting could not be read.')),
        ),
      READ_TIMEOUT_MS,
    );
    state.subscription = bucket.observe$<StoredJson>(key).subscribe({
      next: value => settle(() => resolve(value)),
      error: error => settle(() => reject(error)),
    });
  });
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
 * StorageApi's subscription and written as a functional update.
 *
 * The update runs against the latest stored value, never the render's
 * snapshot (R2-5): with the app's `UserSettingsStorage` a change is emitted
 * only once its PUT returns, so a second toggle inside that round trip, built
 * from the snapshot, would overwrite the first. Writes to one key are queued
 * across every mounted instance, and each starts from the value the previous
 * one stored.
 */
export function useStoredSetting(
  key: string,
  { rereadWhenVisible = false }: StoredSettingOptions = {},
) {
  const storageApi = useApi(storageApiRef);
  const bucket = useMemo(() => storageApi.forBucket(BUCKET), [storageApi]);
  const visibleAgain = useVisibleAgainCount(rereadWhenVisible);

  // `observe$` emits on every change (and, for UserSettingsStorage, once with
  // the fetched value on subscription); the snapshot seeds the first render.
  // A new subscription is what reads the backend again, so a tab that became
  // visible subscribes afresh: the bucket hands out one observable per key,
  // hence the wrapper with an identity of its own (the shown value stays
  // until the answer lands).
  const snapshot = useObservable(
    useMemo(
      () => ({
        subscribe: (
          listener: (value: StorageValueSnapshot<StoredJson>) => void,
        ) => bucket.observe$<StoredJson>(key).subscribe(listener),
      }),
      // `visibleAgain` is the trigger, not an input.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [bucket, key, visibleAgain],
    ),
    useMemo(() => bucket.snapshot<StoredJson>(key), [bucket, key]),
  );
  const latest = useRef(snapshot);
  latest.current = snapshot;

  // Once the subscription has delivered a value with no write in flight, it
  // is the newer truth: another tab or device may have written since.
  useEffect(() => {
    const slot = slotOf(storageApi, key);
    if (slot.pending === 0) {
      slot.written = undefined;
    }
  }, [storageApi, key, snapshot]);

  /**
   * Applies `apply` to the current value and stores what it returns; nothing
   * is written when it returns undefined. Resolves with `apply`'s result.
   */
  const update = useCallback(
    <R>(
      apply: (current: unknown) => { value: StoredJson; result: R } | undefined,
    ): Promise<R | undefined> => {
      const slot = slotOf(storageApi, key);
      const run = async (): Promise<R | undefined> => {
        let current: unknown;
        if (slot.written) {
          current = slot.written.value;
        } else {
          const seen =
            latest.current.presence === 'unknown'
              ? await readStored(bucket, key)
              : latest.current;
          current = seen.presence === 'present' ? seen.value : undefined;
        }
        const change = apply(current);
        if (!change) {
          return undefined;
        }
        slot.written = { value: change.value };
        try {
          await bucket.set(key, change.value);
        } catch (error) {
          // Not stored: the next write starts from what the bucket says.
          slot.written = undefined;
          throw error;
        }
        return change.result;
      };
      slot.pending += 1;
      const done = slot.tail.then(run).finally(() => {
        slot.pending -= 1;
      });
      // The queue goes on whether or not this write failed.
      slot.tail = done.catch(() => {});
      return done;
    },
    [storageApi, bucket, key],
  );

  return { snapshot, update };
}
