import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  analyticsApiRef,
  storageApiRef,
  StorageApi,
} from '@backstage/core-plugin-api';
import { usePinnedSessions } from './usePinnedSessions';

const BUCKET = 'agent-platform';
const KEY = 'pinnedSessions';

const analyticsApi = mockApis.analytics.mock();

function renderWith(storage: StorageApi) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [storageApiRef, storage],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      {children}
    </TestApiProvider>
  );

  return renderHook(() => usePinnedSessions(), { wrapper });
}

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
  return { storage: bucket, release };
}

/** What the hook left behind in the storage bucket. */
function stored(storage: StorageApi) {
  return storage.forBucket(BUCKET).snapshot(KEY).value;
}

describe('usePinnedSessions', () => {
  it('starts with nothing pinned when nothing is stored', () => {
    const { result } = renderWith(mockApis.storage());

    expect(result.current.pinnedIds).toEqual([]);
    expect(result.current.isPinned('gazelle/abc')).toBe(false);
  });

  it('reads previously stored pins and keys them by installation/sessionId', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, [
      { installation: 'gazelle', sessionId: 'abc' },
      { installation: 'goat', sessionId: 'def' },
    ]);

    const { result } = renderWith(storage);

    expect(result.current.pinnedIds).toEqual(['gazelle/abc', 'goat/def']);
    expect(result.current.isPinned('gazelle/abc')).toBe(true);
    expect(result.current.isPinned('gazelle/def')).toBe(false);
  });

  it('pins a session by storing an { installation, sessionId } entry', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.togglePin('gazelle/abc');
    });

    expect(stored(storage)).toEqual([
      { installation: 'gazelle', sessionId: 'abc' },
    ]);
    await waitFor(() =>
      expect(result.current.isPinned('gazelle/abc')).toBe(true),
    );
  });

  it('unpins a pinned session and leaves the others alone', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, [
      { installation: 'gazelle', sessionId: 'abc' },
      { installation: 'goat', sessionId: 'def' },
    ]);
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.togglePin('gazelle/abc');
    });

    expect(stored(storage)).toEqual([
      { installation: 'goat', sessionId: 'def' },
    ]);
    await waitFor(() => expect(result.current.pinnedIds).toEqual(['goat/def']));
  });

  it('keeps every mounted instance in sync through the storage subscription', async () => {
    const storage = mockApis.storage();
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[storageApiRef, storage]]}>
        {children}
      </TestApiProvider>
    );
    const { result } = renderHook(
      () => ({ first: usePinnedSessions(), second: usePinnedSessions() }),
      { wrapper },
    );

    await act(async () => {
      await result.current.first.togglePin('gazelle/abc');
    });

    await waitFor(() =>
      expect(result.current.second.pinnedIds).toEqual(['gazelle/abc']),
    );
  });

  it('keeps a session id that itself contains a slash intact', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.togglePin('gazelle/abc/def');
    });

    // Only the first slash separates the installation.
    expect(stored(storage)).toEqual([
      { installation: 'gazelle', sessionId: 'abc/def' },
    ]);
    await waitFor(() =>
      expect(result.current.isPinned('gazelle/abc/def')).toBe(true),
    );
  });

  it('ignores an id with no installation part instead of storing junk', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.togglePin('no-slash');
      await result.current.togglePin('/leading');
      await result.current.togglePin('trailing/');
    });

    expect(result.current.pinnedIds).toEqual([]);
    expect(stored(storage)).toBeUndefined();
  });

  it('drops malformed stored entries rather than producing broken ids', async () => {
    // The bucket is shared with other portal versions, so the stored value is
    // validated, not trusted.
    const storage = mockApis.storage();
    await storage
      .forBucket(BUCKET)
      .set(KEY, [
        { installation: 'gazelle', sessionId: 'abc' },
        { installation: 'goat' },
        'not-an-object',
        null,
        { installation: '', sessionId: 'x' },
      ] as any);

    const { result } = renderWith(storage);

    expect(result.current.pinnedIds).toEqual(['gazelle/abc']);
  });

  it('treats a stored non-array value as nothing pinned', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, { oops: true });

    const { result } = renderWith(storage);

    expect(result.current.pinnedIds).toEqual([]);
  });
  it('keeps both of two toggles in quick succession', async () => {
    const { storage, release } = laggingStorage();
    const { result } = renderWith(storage);

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      // Neither awaited: the second starts while the first is in flight.
      first = result.current.togglePin('gazelle/abc');
      second = result.current.togglePin('goat/def');
    });
    release();
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(stored(storage)).toEqual([
      { installation: 'gazelle', sessionId: 'abc' },
      { installation: 'goat', sessionId: 'def' },
    ]);
    await waitFor(() =>
      expect(result.current.pinnedIds).toEqual(['gazelle/abc', 'goat/def']),
    );
  });

  it('reports each change, and which way it went', async () => {
    jest.mocked(analyticsApi.captureEvent).mockClear();
    const { result } = renderWith(mockApis.storage());

    await act(async () => {
      await result.current.togglePin('gazelle/abc');
    });
    await act(async () => {
      await result.current.togglePin('gazelle/abc');
    });

    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(2);
    expect(analyticsApi.captureEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'AgentPlatform.sessionPinChanged',
        attributes: { change: 'pinned' },
      }),
    );
    expect(analyticsApi.captureEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'AgentPlatform.sessionPinChanged',
        attributes: { change: 'unpinned' },
      }),
    );
  });
});
