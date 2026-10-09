import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { storageApiRef, StorageApi } from '@backstage/core-plugin-api';
import { usePinnedSessions } from './usePinnedSessions';

const BUCKET = 'agent-platform';
const KEY = 'pinnedSessions';

function renderWith(storage: StorageApi) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[storageApiRef, storage]]}>
      {children}
    </TestApiProvider>
  );

  return renderHook(() => usePinnedSessions(), { wrapper });
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
});
