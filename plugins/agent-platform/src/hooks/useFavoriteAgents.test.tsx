import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { storageApiRef, StorageApi } from '@backstage/core-plugin-api';
import { useFavoriteAgents } from './useFavoriteAgents';

const BUCKET = 'agent-platform';
const KEY = 'favoriteAgents';

function renderWith(storage: StorageApi) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[storageApiRef, storage]]}>
      {children}
    </TestApiProvider>
  );

  return renderHook(() => useFavoriteAgents(), { wrapper });
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
});
