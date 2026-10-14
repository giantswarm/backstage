import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  analyticsApiRef,
  storageApiRef,
  StorageApi,
} from '@backstage/core-plugin-api';
import { useFavoriteAgentIds, useFavoriteAgents } from './useFavoriteAgents';

const BUCKET = 'agent-platform';
const KEY = 'favoriteAgents';

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

  return renderHook(() => useFavoriteAgents(), { wrapper });
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

describe('useFavoriteAgents', () => {
  it('starts with no favorites when nothing is stored', () => {
    const { result } = renderWith(mockApis.storage());

    expect(result.current.pinnedIds).toEqual([]);
    expect(result.current.isPinned('gazelle/sre-team/triager')).toBe(false);
  });

  it('reads previously stored favorites and keys them like AgentRow.id', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, [
      { installation: 'gazelle', name: 'triager', namespace: 'sre-team' },
      { installation: 'goat', name: 'helper', namespace: 'default' },
    ]);

    const { result } = renderWith(storage);

    expect(result.current.pinnedIds).toEqual([
      'gazelle/sre-team/triager',
      'goat/default/helper',
    ]);
    expect(result.current.isPinned('gazelle/sre-team/triager')).toBe(true);
    expect(result.current.isPinned('gazelle/sre-team/other')).toBe(false);
  });

  it('favorites an agent by storing an { installation, name, namespace } entry', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.togglePin('gazelle/sre-team/triager');
    });

    expect(stored(storage)).toEqual([
      { installation: 'gazelle', name: 'triager', namespace: 'sre-team' },
    ]);
    await waitFor(() =>
      expect(result.current.isPinned('gazelle/sre-team/triager')).toBe(true),
    );
  });

  it('unfavorites a favorite and leaves the others alone', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, [
      { installation: 'gazelle', name: 'triager', namespace: 'sre-team' },
      { installation: 'goat', name: 'helper', namespace: 'default' },
    ]);
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.togglePin('gazelle/sre-team/triager');
    });

    expect(stored(storage)).toEqual([
      { installation: 'goat', name: 'helper', namespace: 'default' },
    ]);
    await waitFor(() =>
      expect(result.current.pinnedIds).toEqual(['goat/default/helper']),
    );
  });

  it('keeps every mounted instance in sync through the storage subscription', async () => {
    const storage = mockApis.storage();
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[storageApiRef, storage]]}>
        {children}
      </TestApiProvider>
    );
    const { result } = renderHook(
      () => ({ first: useFavoriteAgents(), second: useFavoriteAgents() }),
      { wrapper },
    );

    await act(async () => {
      await result.current.first.togglePin('gazelle/sre-team/triager');
    });

    await waitFor(() =>
      expect(result.current.second.pinnedIds).toEqual([
        'gazelle/sre-team/triager',
      ]),
    );
  });

  it('round-trips the served-model id shape with its extra slash', async () => {
    // AgentRow ids like `installation-1/ollama//qwen3:0.6b` exist in the
    // fleet; only the first two slashes separate installation and namespace.
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.togglePin('installation-1/ollama//qwen3:0.6b');
    });

    expect(stored(storage)).toEqual([
      {
        installation: 'installation-1',
        name: '/qwen3:0.6b',
        namespace: 'ollama',
      },
    ]);
    await waitFor(() =>
      expect(result.current.isPinned('installation-1/ollama//qwen3:0.6b')).toBe(
        true,
      ),
    );
  });

  it('ignores an id without three parts instead of storing junk', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.togglePin('no-slash');
      await result.current.togglePin('only/one');
      await result.current.togglePin('trailing/name/');
    });

    expect(result.current.pinnedIds).toEqual([]);
    expect(stored(storage)).toBeUndefined();
  });

  it('drops malformed stored entries rather than producing broken ids', async () => {
    const storage = mockApis.storage();
    await storage
      .forBucket(BUCKET)
      .set(KEY, [
        { installation: 'gazelle', name: 'triager', namespace: 'sre-team' },
        { installation: 'goat', name: 'incomplete' },
        'not-an-object',
        null,
        { installation: '', name: 'x', namespace: 'y' },
      ] as any);

    const { result } = renderWith(storage);

    expect(result.current.pinnedIds).toEqual(['gazelle/sre-team/triager']);
  });

  it('allows an empty namespace, which some agent rows carry', async () => {
    const storage = mockApis.storage();
    await storage
      .forBucket(BUCKET)
      .set(KEY, [{ installation: 'gazelle', name: 'served', namespace: '' }]);

    const { result } = renderWith(storage);

    expect(result.current.pinnedIds).toEqual(['gazelle//served']);
  });
  it('keeps both of two toggles in quick succession', async () => {
    const { storage, release } = laggingStorage();
    const { result } = renderWith(storage);

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      // Neither awaited: the second starts while the first is in flight.
      first = result.current.togglePin('gazelle/kagent/triager');
      second = result.current.togglePin('goat/kagent/helper');
    });
    release();
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(stored(storage)).toEqual([
      { installation: 'gazelle', namespace: 'kagent', name: 'triager' },
      { installation: 'goat', namespace: 'kagent', name: 'helper' },
    ]);
    await waitFor(() =>
      expect(result.current.pinnedIds).toEqual([
        'gazelle/kagent/triager',
        'goat/kagent/helper',
      ]),
    );
  });

  it('reports each change, and which way it went', async () => {
    jest.mocked(analyticsApi.captureEvent).mockClear();
    const { result } = renderWith(mockApis.storage());

    await act(async () => {
      await result.current.togglePin('gazelle/kagent/triager');
    });
    await act(async () => {
      await result.current.togglePin('gazelle/kagent/triager');
    });

    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(2);
    expect(analyticsApi.captureEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'AgentPlatform.agentFavoriteChanged',
        attributes: { change: 'added' },
      }),
    );
    expect(analyticsApi.captureEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'AgentPlatform.agentFavoriteChanged',
        attributes: { change: 'removed' },
      }),
    );
  });
});

describe('useFavoriteAgentIds', () => {
  it('reads the stored favorites, oldest star first', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, [
      { installation: 'gazelle', name: 'triager', namespace: 'sre-team' },
      { installation: 'goat', name: 'helper', namespace: 'default' },
    ]);

    const { result } = renderHook(() => useFavoriteAgentIds(), {
      wrapper: ({ children }: PropsWithChildren<{}>) => (
        <TestApiProvider apis={[[storageApiRef, storage]]}>
          {children}
        </TestApiProvider>
      ),
    });

    expect(result.current).toEqual([
      'gazelle/sre-team/triager',
      'goat/default/helper',
    ]);
  });
});
