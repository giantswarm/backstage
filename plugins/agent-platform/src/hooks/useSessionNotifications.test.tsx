import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { storageApiRef, StorageApi } from '@backstage/core-plugin-api';
import { useSessionNotifications } from './useSessionNotifications';

const BUCKET = 'agent-platform';
const KEY = 'sessionNotifications';

function renderWith(storage: StorageApi) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[storageApiRef, storage]]}>
      {children}
    </TestApiProvider>
  );

  return renderHook(() => useSessionNotifications(), { wrapper });
}

/** What the hook left behind in the storage bucket. */
function stored(storage: StorageApi) {
  return storage.forBucket(BUCKET).snapshot(KEY).value;
}

/**
 * Read markers are real state-change timestamps in production, and writes
 * prune markers past the retention window — so the fixtures use recent epochs.
 */
const NOW = Date.now();
const T1 = NOW - 60_000;
const T2 = NOW - 30_000;

describe('useSessionNotifications', () => {
  it('starts with nothing muted and nothing read when nothing is stored', () => {
    const { result } = renderWith(mockApis.storage());

    expect(result.current.settings.size).toBe(0);
    expect(result.current.isMuted('gazelle/abc')).toBe(false);
    expect(result.current.readAtOf('gazelle/abc')).toBeUndefined();
  });

  it('reads previously stored settings keyed by installation/sessionId', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, [
      { installation: 'gazelle', sessionId: 'abc', muted: true },
      { installation: 'goat', sessionId: 'def', readAt: T1 },
    ]);

    const { result } = renderWith(storage);

    expect(result.current.isMuted('gazelle/abc')).toBe(true);
    expect(result.current.isMuted('goat/def')).toBe(false);
    expect(result.current.readAtOf('goat/def')).toBe(T1);
  });

  it('mutes and unmutes a session, keeping its read marker', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.markRead('gazelle/abc', T1);
    });
    await waitFor(() =>
      expect(result.current.readAtOf('gazelle/abc')).toBe(T1),
    );

    await act(async () => {
      await result.current.toggleMute('gazelle/abc');
    });
    await waitFor(() =>
      expect(result.current.isMuted('gazelle/abc')).toBe(true),
    );
    expect(result.current.readAtOf('gazelle/abc')).toBe(T1);

    await act(async () => {
      await result.current.toggleMute('gazelle/abc');
    });
    await waitFor(() =>
      expect(result.current.isMuted('gazelle/abc')).toBe(false),
    );
    expect(result.current.readAtOf('gazelle/abc')).toBe(T1);
  });

  it('marks read at the acknowledged state change, and unread again on demand', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.markRead('gazelle/abc', T2);
    });
    await waitFor(() =>
      expect(result.current.readAtOf('gazelle/abc')).toBe(T2),
    );
    expect(stored(storage)).toEqual([
      { installation: 'gazelle', sessionId: 'abc', readAt: T2 },
    ]);

    await act(async () => {
      await result.current.markUnread('gazelle/abc');
    });
    await waitFor(() =>
      expect(result.current.readAtOf('gazelle/abc')).toBeUndefined(),
    );
    // An entry that is neither muted nor read says nothing, so it is dropped.
    expect(stored(storage)).toEqual([]);
  });

  it('marks read with the current time when no state change is given', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);
    const before = Date.now();

    await act(async () => {
      await result.current.markRead('gazelle/abc');
    });

    await waitFor(() => {
      const readAt = result.current.readAtOf('gazelle/abc');
      expect(readAt).toBeGreaterThanOrEqual(before);
      expect(readAt).toBeLessThanOrEqual(Date.now());
    });
  });

  it('marks everything read in one write', async () => {
    const storage = mockApis.storage();
    const set = jest.spyOn(storage.forBucket(BUCKET), 'set');
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.markAllRead([
        { id: 'gazelle/abc', at: T1 },
        { id: 'goat/def', at: T2 },
      ]);
    });

    await waitFor(() => {
      expect(result.current.readAtOf('gazelle/abc')).toBe(T1);
      expect(result.current.readAtOf('goat/def')).toBe(T2);
    });
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('keeps every mounted instance in sync through the storage subscription', async () => {
    const storage = mockApis.storage();
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[storageApiRef, storage]]}>
        {children}
      </TestApiProvider>
    );
    const { result } = renderHook(
      () => ({
        first: useSessionNotifications(),
        second: useSessionNotifications(),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.first.toggleMute('gazelle/abc');
    });

    await waitFor(() =>
      expect(result.current.second.isMuted('gazelle/abc')).toBe(true),
    );
  });

  it('prunes read markers past the retention window on the next write', async () => {
    const storage = mockApis.storage();
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await storage.forBucket(BUCKET).set(KEY, [
      { installation: 'gazelle', sessionId: 'old', readAt: old },
      {
        installation: 'gazelle',
        sessionId: 'muted-old',
        muted: true,
        readAt: old,
      },
    ]);
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.markRead('gazelle/new', T2);
    });

    await waitFor(() =>
      expect(result.current.readAtOf('gazelle/new')).toBe(T2),
    );
    // The stale unmuted marker went; the muted one stays, mute is forever.
    expect(result.current.readAtOf('gazelle/old')).toBeUndefined();
    expect(result.current.isMuted('gazelle/muted-old')).toBe(true);
  });

  it('ignores an id with no installation part instead of storing junk', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.markRead('no-slash', T1);
      await result.current.toggleMute('/leading');
      await result.current.markRead('trailing/', T1);
    });

    expect(result.current.settings.size).toBe(0);
  });

  it('drops malformed stored entries rather than producing broken state', async () => {
    // The bucket is shared with other portal versions, so the stored value is
    // validated, not trusted.
    const storage = mockApis.storage();
    await storage
      .forBucket(BUCKET)
      .set(KEY, [
        { installation: 'gazelle', sessionId: 'abc', muted: true },
        { installation: 'goat' },
        { installation: 'goat', sessionId: 'x', muted: 'yes' },
        { installation: 'goat', sessionId: 'y', readAt: 'soon' },
        'not-an-object',
        null,
      ] as any);

    const { result } = renderWith(storage);

    expect([...result.current.settings.keys()]).toEqual(['gazelle/abc']);
  });

  it('treats a stored non-array value as no settings', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, { oops: true });

    const { result } = renderWith(storage);

    expect(result.current.settings.size).toBe(0);
  });
});
