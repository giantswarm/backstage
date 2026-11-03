import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { storageApiRef, type StorageApi } from '@backstage/core-plugin-api';
import { useStoredSetting } from './useStoredSetting';

const BUCKET = 'agent-platform';
const KEY = 'someList';

/**
 * A bucket whose writes land only once `release` is called, like
 * `UserSettingsStorage`'s, which emits a change after its PUT returns.
 */
function laggingStorage() {
  const inner = mockApis.storage().forBucket(BUCKET);
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const bucket = {
    forBucket: () => bucket,
    snapshot: (key: string) => inner.snapshot(key),
    observe$: (key: string) => inner.observe$(key),
    remove: (key: string) => inner.remove(key),
    set: async (key: string, value: never) => {
      await gate;
      await inner.set(key, value);
    },
  } as unknown as StorageApi;
  return { storage: bucket, inner, release };
}

/**
 * A bucket like `UserSettingsStorage` before its first read: the snapshot is
 * unknown, and a subscription delivers the stored value.
 */
function unreadStorage(stored: string[]) {
  const inner = mockApis.storage().forBucket(BUCKET);
  const bucket = {
    forBucket: () => bucket,
    snapshot: (key: string) => ({ key, presence: 'unknown' }),
    observe$: (key: string) => ({
      subscribe: (
        observer:
          ((value: unknown) => void) | { next: (value: unknown) => void },
      ) => {
        const next = typeof observer === 'function' ? observer : observer.next;
        next({ key, presence: 'present', value: stored });
        return { unsubscribe: () => {} };
      },
    }),
    remove: (key: string) => inner.remove(key),
    set: (key: string, value: never) => inner.set(key, value),
  } as unknown as StorageApi;
  return { storage: bucket, inner };
}

function renderWith(storage: StorageApi) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[storageApiRef, storage]]}>
      {children}
    </TestApiProvider>
  );
  return renderHook(() => useStoredSetting(KEY), { wrapper });
}

const append =
  (entry: string) =>
  (current: unknown): { value: string[]; result: string } => ({
    value: [...(Array.isArray(current) ? current : []), entry],
    result: entry,
  });

describe('useStoredSetting', () => {
  it('applies updates in quick succession to the latest stored value, so none is lost', async () => {
    const { storage, inner, release } = laggingStorage();
    const { result } = renderWith(storage);

    let first: Promise<unknown> = Promise.resolve();
    let second: Promise<unknown> = Promise.resolve();
    act(() => {
      // Neither awaited: the second starts while the first is in flight.
      first = result.current.update(append('a'));
      second = result.current.update(append('b'));
    });
    release();
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(inner.snapshot(KEY).value).toEqual(['a', 'b']);
    await expect(first).resolves.toBe('a');
    await expect(second).resolves.toBe('b');
  });

  it('writes nothing when the update makes no change', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, ['a']);
    const set = jest.spyOn(storage.forBucket(BUCKET), 'set');
    const { result } = renderWith(storage);

    await act(async () => {
      await expect(result.current.update(() => undefined)).resolves.toBe(
        undefined,
      );
    });

    expect(set).not.toHaveBeenCalled();
  });

  it('reads the stored value first when none has been seen yet', async () => {
    const { storage, inner } = unreadStorage(['stored']);
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.update(append('new'));
    });

    expect(inner.snapshot(KEY).value).toEqual(['stored', 'new']);
  });

  it('starts from what the bucket says once a write failed', async () => {
    const storage = mockApis.storage();
    const bucket = storage.forBucket(BUCKET);
    await bucket.set(KEY, ['a']);
    const { result } = renderWith(storage);
    jest.spyOn(bucket, 'set').mockRejectedValueOnce(new Error('offline'));

    await act(async () => {
      await expect(result.current.update(append('lost'))).rejects.toThrow(
        'offline',
      );
    });
    await act(async () => {
      await result.current.update(append('b'));
    });

    await waitFor(() => expect(bucket.snapshot(KEY).value).toEqual(['a', 'b']));
  });

  it('refuses to write when the stored value could not be read', async () => {
    // The app's user-settings storage hands out a read the backend did not
    // answer as unknown. A write built on it would replace the stored value.
    const inner = mockApis.storage().forBucket(BUCKET);
    await inner.set(KEY, ['a', 'b']);
    const bucket = {
      forBucket: () => bucket,
      snapshot: (key: string) => ({ key, presence: 'unknown' }),
      observe$: (key: string) => ({
        subscribe: (
          observer:
            ((value: unknown) => void) | { next: (value: unknown) => void },
        ) => {
          const next =
            typeof observer === 'function' ? observer : observer.next;
          next({ key, presence: 'unknown' });
          return { unsubscribe: () => {} };
        },
      }),
      remove: (key: string) => inner.remove(key),
      set: jest.fn((key: string, value: never) => inner.set(key, value)),
    } as unknown as StorageApi;
    const { result } = renderWith(bucket);

    await act(async () => {
      await expect(result.current.update(append('c'))).rejects.toThrow(
        'could not be read',
      );
    });

    expect(bucket.set).not.toHaveBeenCalled();
    expect(inner.snapshot(KEY).value).toEqual(['a', 'b']);
  });

  it('keeps showing a known value when a later read is not answered', async () => {
    const listeners: Array<(value: unknown) => void> = [];
    const bucket = {
      forBucket: () => bucket,
      snapshot: (key: string) => ({ key, presence: 'unknown' }),
      observe$: () => ({
        subscribe: (observer: (value: unknown) => void) => {
          listeners.push(observer);
          return { unsubscribe: () => {} };
        },
      }),
    } as unknown as StorageApi;
    const { result } = renderWith(bucket);

    act(() =>
      listeners.forEach(next =>
        next({ key: KEY, presence: 'present', value: ['a'] }),
      ),
    );
    act(() =>
      listeners.forEach(next => next({ key: KEY, presence: 'unknown' })),
    );

    expect(result.current.snapshot).toEqual({
      key: KEY,
      presence: 'present',
      value: ['a'],
    });
  });

  it('keeps the shown value, not a new copy, when a read answers the same', async () => {
    const listeners: Array<(value: unknown) => void> = [];
    const bucket = {
      forBucket: () => bucket,
      snapshot: (key: string) => ({ key, presence: 'unknown' }),
      observe$: () => ({
        subscribe: (observer: (value: unknown) => void) => {
          listeners.push(observer);
          return { unsubscribe: () => {} };
        },
      }),
    } as unknown as StorageApi;
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[storageApiRef, bucket]]}>
        {children}
      </TestApiProvider>
    );
    const { result } = renderHook(() => useStoredSetting(KEY), { wrapper });
    const emit = (value: unknown) =>
      act(() =>
        listeners.forEach(next =>
          next({ key: KEY, presence: 'present', value }),
        ),
      );

    emit({ sessions: { 'gazelle/abc': { level: 'all', at: 1 } } });
    const shown = result.current.snapshot;
    // A write's own answer and the signal's re-read: the same value again.
    // The same snapshot object, so what readers derive from it (the session
    // page's header actions) keeps its identity too.
    emit({ sessions: { 'gazelle/abc': { level: 'all', at: 1 } } });
    emit({ sessions: { 'gazelle/abc': { level: 'all', at: 1 } } });

    expect(result.current.snapshot).toBe(shown);

    emit({ sessions: { 'gazelle/abc': { level: 'muted', at: 2 } } });
    expect(result.current.snapshot.value).toEqual({
      sessions: { 'gazelle/abc': { level: 'muted', at: 2 } },
    });
  });
});
