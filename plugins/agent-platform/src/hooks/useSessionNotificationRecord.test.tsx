import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  analyticsApiRef,
  storageApiRef,
  type StorageApi,
  type StorageValueSnapshot,
} from '@backstage/core-plugin-api';
import type { JsonValue } from '@backstage/types';
import type { KagentSession } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  useNotificationRecordPruning,
  useNotificationSeenMarks,
  usePortalStartedRecorder,
  useSessionNotificationRecord,
  useSessionNotificationSettings,
} from './useSessionNotificationRecord';

const BUCKET = 'agent-platform';
const SETTINGS = 'sessionNotificationSettings';
const SEEN = 'notificationSeenMarks';

const analyticsApi = mockApis.analytics.mock();

function wrapperFor(storage: StorageApi) {
  return ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [storageApiRef, storage],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      {children}
    </TestApiProvider>
  );
}

function stored(storage: StorageApi, key: string) {
  return storage.forBucket(BUCKET).snapshot(key).value;
}

/**
 * A bucket that, like the user-settings storage, reads the backend on every
 * new subscription and says nothing when another tab or device writes unless
 * told (`announce`): what `backend` holds is what a fresh read answers.
 */
function backendStorage(initial: Record<string, JsonValue>) {
  const backend = new Map<string, JsonValue>(Object.entries(initial));
  const reads = { failing: false };
  const listeners = new Map<
    string,
    Set<(snapshot: StorageValueSnapshot<JsonValue>) => void>
  >();
  const snapshotOf = (key: string): StorageValueSnapshot<JsonValue> =>
    backend.has(key)
      ? { key, presence: 'present', value: backend.get(key)! }
      : { key, presence: 'absent' };
  const emit = (key: string) =>
    listeners.get(key)?.forEach(listener => listener(snapshotOf(key)));
  const bucket = {
    forBucket: () => bucket,
    snapshot: (key: string) => ({ key, presence: 'unknown' }),
    observe$: (key: string) => ({
      subscribe: (
        observer:
          | ((snapshot: StorageValueSnapshot<JsonValue>) => void)
          | { next: (snapshot: StorageValueSnapshot<JsonValue>) => void },
      ) => {
        const listener =
          typeof observer === 'function'
            ? observer
            : (snapshot: StorageValueSnapshot<JsonValue>) =>
                observer.next(snapshot);
        const set = listeners.get(key) ?? new Set();
        set.add(listener);
        listeners.set(key, set);
        // Answers asynchronously, as a fetch does; a failed read is unknown.
        Promise.resolve().then(() =>
          listener(
            reads.failing ? { key, presence: 'unknown' } : snapshotOf(key),
          ),
        );
        return { unsubscribe: () => set.delete(listener) };
      },
    }),
    set: async (key: string, value: JsonValue) => {
      backend.set(key, value);
      emit(key);
    },
    remove: async (key: string) => {
      backend.delete(key);
      emit(key);
    },
  } as unknown as StorageApi;
  return {
    storage: bucket,
    /** Another tab or device stores a value, unannounced. */
    writeElsewhere: (key: string, value: JsonValue) => backend.set(key, value),
    /** The backend's signal for that write reaches this tab. */
    announce: emit,
    /** Reads stop being answered (offline), or start again. */
    failReads: (failing: boolean) => {
      reads.failing = failing;
    },
    backendValue: (key: string) => backend.get(key),
  };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  jest.mocked(analyticsApi.captureEvent).mockClear();
});

afterEach(() => {
  setVisibility('visible');
});

describe('useSessionNotificationSettings', () => {
  it('reads Default and not portal-started for a session without an entry', () => {
    const { result } = renderHook(() => useSessionNotificationSettings(), {
      wrapper: wrapperFor(mockApis.storage()),
    });

    expect(result.current.isKnown).toBe(true);
    expect(result.current.levelOf('gazelle', 'abc')).toBe('default');
    expect(result.current.isPortalStarted('gazelle', 'abc')).toBe(false);
  });

  it('reads the stored level and origin', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(SETTINGS, {
      sessions: {
        'gazelle/abc': { origin: 'portal', level: 'all', at: 1 },
        'gazelle/def': { level: 'muted', at: 1 },
      },
    });

    const { result } = renderHook(() => useSessionNotificationSettings(), {
      wrapper: wrapperFor(storage),
    });

    expect(result.current.levelOf('gazelle', 'abc')).toBe('all');
    expect(result.current.isPortalStarted('gazelle', 'abc')).toBe(true);
    expect(result.current.levelOf('gazelle', 'def')).toBe('muted');
    expect(result.current.isPortalStarted('gazelle', 'def')).toBe(false);
  });

  it('is not known until the stored value has been read', async () => {
    const { storage } = backendStorage({});

    const { result } = renderHook(() => useSessionNotificationSettings(), {
      wrapper: wrapperFor(storage),
    });

    expect(result.current.isKnown).toBe(false);
    await waitFor(() => expect(result.current.isKnown).toBe(true));
    expect(result.current.levelOf('gazelle', 'abc')).toBe('default');
  });

  it('mutes a session without an entry, without making it portal-started, and reports it', async () => {
    const storage = mockApis.storage();
    const { result } = renderHook(() => useSessionNotificationSettings(), {
      wrapper: wrapperFor(storage),
    });

    await act(async () => {
      await result.current.setLevel('gazelle', 'slack-started', 'muted');
    });

    expect(stored(storage, SETTINGS)).toEqual({
      sessions: {
        'gazelle/slack-started': { level: 'muted', at: expect.any(Number) },
      },
    });
    await waitFor(() =>
      expect(result.current.levelOf('gazelle', 'slack-started')).toBe('muted'),
    );
    expect(result.current.isPortalStarted('gazelle', 'slack-started')).toBe(
      false,
    );
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.sessionNotificationLevelChanged',
        attributes: expect.objectContaining({ level: 'muted' }),
      }),
    );
  });

  it('unmutes with Default', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(SETTINGS, {
      sessions: { 'gazelle/abc': { level: 'muted', at: 1 } },
    });
    const { result } = renderHook(() => useSessionNotificationSettings(), {
      wrapper: wrapperFor(storage),
    });

    await act(async () => {
      await result.current.setLevel('gazelle', 'abc', 'default');
    });

    await waitFor(() =>
      expect(result.current.levelOf('gazelle', 'abc')).toBe('default'),
    );
    expect(stored(storage, SETTINGS)).toEqual({ sessions: {} });
  });

  it('records a session as portal-started, keeping the others', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(SETTINGS, {
      sessions: { 'golem/xyz': { level: 'muted', at: 1 } },
    });
    const { result } = renderHook(
      () => ({
        settings: useSessionNotificationSettings(),
        markPortalStarted: usePortalStartedRecorder(),
      }),
      { wrapper: wrapperFor(storage) },
    );

    await act(async () => {
      await result.current.markPortalStarted('gazelle', 'abc');
    });

    await waitFor(() =>
      expect(result.current.settings.isPortalStarted('gazelle', 'abc')).toBe(
        true,
      ),
    );
    expect(result.current.settings.levelOf('golem', 'xyz')).toBe('muted');
    // Part of the session start, which reports its own event.
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('keeps its identity while nothing changes', () => {
    const { result, rerender } = renderHook(
      () => useSessionNotificationRecord(),
      { wrapper: wrapperFor(mockApis.storage()) },
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('applies two quick changes to different sessions without losing either', async () => {
    const storage = mockApis.storage();
    const { result } = renderHook(() => useSessionNotificationSettings(), {
      wrapper: wrapperFor(storage),
    });

    await act(async () => {
      await Promise.all([
        result.current.setLevel('gazelle', 'abc', 'muted'),
        result.current.setLevel('gazelle', 'def', 'all'),
      ]);
    });

    await waitFor(() =>
      expect(result.current.levelOf('gazelle', 'def')).toBe('all'),
    );
    expect(result.current.levelOf('gazelle', 'abc')).toBe('muted');
  });

  it('follows a level another tab set, once the backend announces it', async () => {
    const { storage, writeElsewhere, announce } = backendStorage({});
    const { result } = renderHook(() => useSessionNotificationSettings(), {
      wrapper: wrapperFor(storage),
    });
    await waitFor(() => expect(result.current.isKnown).toBe(true));

    writeElsewhere(SETTINGS, {
      sessions: { 'gazelle/abc': { level: 'muted', at: 1 } },
    });
    expect(result.current.levelOf('gazelle', 'abc')).toBe('default');
    act(() => announce(SETTINGS));

    await waitFor(() =>
      expect(result.current.levelOf('gazelle', 'abc')).toBe('muted'),
    );
  });

  it('keeps the levels and erases nothing when the tab wakes up offline', async () => {
    const record = {
      sessions: {
        'gazelle/abc': { level: 'muted', at: 1 },
        'gazelle/def': { origin: 'portal', level: 'all', at: 1 },
      },
    };
    const { storage, failReads, backendValue } = backendStorage({
      [SETTINGS]: record,
    });
    const { result } = renderHook(
      () => ({
        settings: useSessionNotificationSettings(),
        markPortalStarted: usePortalStartedRecorder(),
      }),
      { wrapper: wrapperFor(storage) },
    );
    await waitFor(() => expect(result.current.settings.isKnown).toBe(true));

    // Woken up before the network is back: the re-read is not answered.
    failReads(true);
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.settings.levelOf('gazelle', 'abc')).toBe('muted');
    expect(result.current.settings.levelOf('gazelle', 'def')).toBe('all');
    // A write needs the stored value; without it, it fails rather than
    // replacing the record with only its own entry.
    await act(async () => {
      await expect(
        result.current.settings.setLevel('gazelle', 'ghi', 'muted'),
      ).rejects.toThrow('could not be read');
      await expect(
        result.current.markPortalStarted('gazelle', 'new'),
      ).rejects.toThrow('could not be read');
    });
    expect(backendValue(SETTINGS)).toEqual(record);
  });

  it('builds a write on the stored value, not on what the tab last saw', async () => {
    const { storage, writeElsewhere, backendValue } = backendStorage({});
    const { result } = renderHook(() => useSessionNotificationSettings(), {
      wrapper: wrapperFor(storage),
    });
    await waitFor(() => expect(result.current.isKnown).toBe(true));

    // Another device mutes a session; this tab has not heard of it.
    writeElsewhere(SETTINGS, {
      sessions: { 'gazelle/abc': { level: 'muted', at: 1 } },
    });
    await act(async () => {
      await result.current.setLevel('gazelle', 'def', 'all');
    });

    expect(backendValue(SETTINGS)).toEqual({
      sessions: {
        'gazelle/abc': { level: 'muted', at: 1 },
        'gazelle/def': { level: 'all', at: expect.any(Number) },
      },
    });
  });

  it('reads the record again when the tab becomes visible', async () => {
    const { storage, writeElsewhere } = backendStorage({});
    const { result } = renderHook(() => useSessionNotificationSettings(), {
      wrapper: wrapperFor(storage),
    });
    await waitFor(() => expect(result.current.isKnown).toBe(true));

    // Written while this tab was hidden, its announcement missed.
    setVisibility('hidden');
    writeElsewhere(SETTINGS, {
      sessions: { 'gazelle/abc': { level: 'all', at: 1 } },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.levelOf('gazelle', 'abc')).toBe('default');

    act(() => setVisibility('visible'));

    await waitFor(() =>
      expect(result.current.levelOf('gazelle', 'abc')).toBe('all'),
    );
  });
});

describe('useNotificationSeenMarks', () => {
  const waitingRow = {
    kind: 'session' as const,
    installation: 'gazelle',
    sessionId: 'abc',
    mark: 'gazelle/abc/waiting/2026-10-15T10:00:00Z',
  };
  const mcpRow = {
    kind: 'mcpSignIn' as const,
    installation: 'gazelle',
    mark: 'gazelle/mcp/github,kubernetes',
  };

  it('has seen nothing when nothing is stored', () => {
    const { result } = renderHook(() => useNotificationSeenMarks(), {
      wrapper: wrapperFor(mockApis.storage()),
    });

    expect(result.current.isSeen(waitingRow)).toBe(false);
    expect(result.current.sessionSeenMarkOf('gazelle', 'abc')).toBeUndefined();
    expect(result.current.mcpSignInSeenMarkOf('gazelle')).toBeUndefined();
  });

  it('marks one row seen', async () => {
    const storage = mockApis.storage();
    const { result } = renderHook(() => useNotificationSeenMarks(), {
      wrapper: wrapperFor(storage),
    });

    await act(async () => {
      await result.current.markSeen(waitingRow);
    });

    await waitFor(() => expect(result.current.isSeen(waitingRow)).toBe(true));
    expect(result.current.sessionSeenMarkOf('gazelle', 'abc')).toBe(
      waitingRow.mark,
    );
    // A new row of the same session is unread again.
    expect(
      result.current.isSeen({ ...waitingRow, mark: 'gazelle/abc/failed/2' }),
    ).toBe(false);
  });

  it('marks every row seen in one write', async () => {
    const storage = mockApis.storage();
    const bucket = storage.forBucket(BUCKET);
    const set = jest.spyOn(bucket, 'set');
    const { result } = renderHook(() => useNotificationSeenMarks(), {
      wrapper: wrapperFor(storage),
    });

    await act(async () => {
      await result.current.markManySeen([
        waitingRow,
        { ...waitingRow, sessionId: 'def', mark: 'gazelle/def/failed/1' },
        mcpRow,
      ]);
    });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(SEEN, {
      sessions: {
        'gazelle/abc': { mark: waitingRow.mark, at: expect.any(Number) },
        'gazelle/def': { mark: 'gazelle/def/failed/1', at: expect.any(Number) },
      },
      mcpSignIn: { gazelle: { mark: mcpRow.mark, at: expect.any(Number) } },
    });
    await waitFor(() => expect(result.current.isSeen(mcpRow)).toBe(true));
  });

  it('follows a row another tab marked seen', async () => {
    const { storage, writeElsewhere, announce } = backendStorage({});
    const { result } = renderHook(() => useNotificationSeenMarks(), {
      wrapper: wrapperFor(storage),
    });
    await waitFor(() => expect(result.current.isKnown).toBe(true));

    writeElsewhere(SEEN, {
      sessions: { 'gazelle/abc': { mark: waitingRow.mark, at: 1 } },
      mcpSignIn: {},
    });
    act(() => announce(SEEN));

    await waitFor(() => expect(result.current.isSeen(waitingRow)).toBe(true));
  });
});

describe('useSessionNotificationRecord', () => {
  it('is known once both keys have been read', async () => {
    const { storage } = backendStorage({
      [SETTINGS]: { sessions: { 'gazelle/abc': { origin: 'portal', at: 1 } } },
    });

    const { result } = renderHook(() => useSessionNotificationRecord(), {
      wrapper: wrapperFor(storage),
    });

    expect(result.current.isKnown).toBe(false);
    await waitFor(() => expect(result.current.isKnown).toBe(true));
    expect(result.current.isPortalStarted('gazelle', 'abc')).toBe(true);
    expect(result.current.levelOf('gazelle', 'abc')).toBe('default');
    expect(result.current.sessionSeenMarkOf('gazelle', 'abc')).toBeUndefined();
  });
});

describe('useNotificationRecordPruning', () => {
  const session = (sessionId: string) =>
    ({
      id: `gazelle/${sessionId}`,
      sessionId,
      installation: 'gazelle',
    }) as KagentSession;

  async function storedRecord() {
    const storage = mockApis.storage();
    const bucket = storage.forBucket(BUCKET);
    await bucket.set(SETTINGS, {
      sessions: {
        'gazelle/live': { origin: 'portal', at: 1 },
        'gazelle/gone': { origin: 'portal', level: 'all', at: 1 },
        'golem/elsewhere': { level: 'muted', at: 1 },
      },
    });
    await bucket.set(SEEN, {
      sessions: {
        'gazelle/live': { mark: 'a', at: 1 },
        'gazelle/gone': { mark: 'b', at: 1 },
      },
      mcpSignIn: { gazelle: { mark: 'c', at: 1 } },
    });
    return storage;
  }

  function renderPruning(storage: StorageApi) {
    return renderHook(() => useNotificationRecordPruning(), {
      wrapper: wrapperFor(storage),
    });
  }

  it('reads nothing more while the list names every session the record does', async () => {
    const storage = await storedRecord();
    const readComplete = jest.fn();
    const { result } = renderPruning(storage);

    await act(async () => {
      await expect(
        result.current({
          installation: 'gazelle',
          listedSessionIds: ['live', 'gone', 'another'],
          readComplete,
        }),
      ).resolves.toBe(false);
    });

    expect(readComplete).not.toHaveBeenCalled();
  });

  it('drops the entries of a session a complete read no longer lists', async () => {
    const storage = await storedRecord();
    const { result } = renderPruning(storage);

    await act(async () => {
      await result.current({
        installation: 'gazelle',
        listedSessionIds: ['live'],
        readComplete: async () => [session('live')],
      });
    });

    expect(stored(storage, SETTINGS)).toEqual({
      sessions: {
        'gazelle/live': { origin: 'portal', at: 1 },
        'golem/elsewhere': { level: 'muted', at: 1 },
      },
    });
    expect(stored(storage, SEEN)).toEqual({
      sessions: { 'gazelle/live': { mark: 'a', at: 1 } },
      mcpSignIn: { gazelle: { mark: 'c', at: 1 } },
    });
  });

  it('prunes nothing when the fresh read is not complete', async () => {
    const storage = await storedRecord();
    const before = stored(storage, SETTINGS);
    const { result } = renderPruning(storage);

    await act(async () => {
      await result.current({
        installation: 'gazelle',
        listedSessionIds: ['live'],
        // Rows skipped, or the listing cut at the backend's page limit.
        readComplete: async () => undefined,
      });
    });

    expect(stored(storage, SETTINGS)).toEqual(before);
  });

  it('keeps an entry written while the read was under way', async () => {
    const storage = await storedRecord();
    const { result } = renderHook(
      () => ({
        prune: useNotificationRecordPruning(),
        markPortalStarted: usePortalStartedRecorder(),
      }),
      { wrapper: wrapperFor(storage) },
    );

    await act(async () => {
      await result.current.prune({
        installation: 'gazelle',
        listedSessionIds: ['live'],
        readComplete: async () => {
          // Started in another tab once this read had left: not listed.
          await result.current.markPortalStarted('gazelle', 'brand-new');
          return [session('live')];
        },
      });
    });

    expect(
      Object.keys((stored(storage, SETTINGS) as { sessions: object }).sessions),
    ).toEqual(['gazelle/live', 'golem/elsewhere', 'gazelle/brand-new']);
  });
});
