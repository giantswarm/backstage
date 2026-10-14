import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  analyticsApiRef,
  storageApiRef,
  StorageApi,
} from '@backstage/core-plugin-api';
import {
  TOOL_ACTIVITY_READ_TIMEOUT_MS,
  useShowToolActivity,
} from './useShowToolActivity';

const BUCKET = 'agent-platform';
const KEY = 'showToolActivity';

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

  return renderHook(() => useShowToolActivity(), { wrapper });
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

/**
 * A bucket that reads like `UserSettingsStorage`: "unknown" until its
 * subscription delivers the value, which `deliver` does.
 */
function remoteStorage() {
  // A hand-rolled observable: `useObservable` subscribes with a function,
  // `readStored` with an observer.
  type Next = (value: unknown) => void;
  const subscribers = new Set<Next>();
  const state: {
    value: { presence: 'unknown' | 'present' | 'absent'; value?: unknown };
    /** Whether a new subscription is answered with the value, as a read. */
    answers: boolean;
  } = { value: { presence: 'unknown' }, answers: true };
  const bucket = {
    forBucket: () => bucket,
    snapshot: () => ({ key: KEY, presence: 'unknown' }),
    observe$: () => ({
      subscribe: (observer: Next | { next: Next }) => {
        const next = typeof observer === 'function' ? observer : observer.next;
        subscribers.add(next);
        if (state.answers && state.value.presence !== 'unknown') {
          next({ key: KEY, ...state.value });
        }
        return { unsubscribe: () => subscribers.delete(next) };
      },
    }),
    set: jest.fn(),
    remove: jest.fn(),
  } as unknown as StorageApi;
  const deliver = (next: typeof state.value) => {
    state.value = next;
    subscribers.forEach(subscriber => subscriber({ key: KEY, ...next }));
  };
  return { storage: bucket, deliver, state };
}

function stored(storage: StorageApi) {
  return storage.forBucket(BUCKET).snapshot(KEY).value;
}

describe('useShowToolActivity', () => {
  beforeEach(() => jest.mocked(analyticsApi.captureEvent).mockClear());

  it('shows tool activity when nothing is stored', () => {
    const { result } = renderWith(mockApis.storage());

    expect(result.current.showToolActivity).toBe(true);
  });

  it('reads a stored choice to hide it', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, false);

    const { result } = renderWith(storage);

    expect(result.current.showToolActivity).toBe(false);
  });

  it('shows tool activity for a value it does not recognise', async () => {
    // The bucket is shared with other portal versions; only `false` hides.
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, 'no');

    const { result } = renderWith(storage);

    expect(result.current.showToolActivity).toBe(true);
  });

  it('stores the choice and reports which way it went', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.setShowToolActivity(false);
    });
    expect(stored(storage)).toBe(false);
    expect(result.current.showToolActivity).toBe(false);

    await act(async () => {
      await result.current.setShowToolActivity(true);
    });
    expect(stored(storage)).toBe(true);
    expect(result.current.showToolActivity).toBe(true);

    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(2);
    expect(analyticsApi.captureEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'AgentPlatform.toolActivityChanged',
        attributes: { change: 'hidden' },
      }),
    );
    expect(analyticsApi.captureEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'AgentPlatform.toolActivityChanged',
        attributes: { change: 'shown' },
      }),
    );
  });

  it('writes and reports nothing when the choice is already stored', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.setShowToolActivity(true);
    });

    expect(stored(storage)).toBeUndefined();
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('is known at once from a store that answers synchronously', () => {
    const { result } = renderWith(mockApis.storage());

    expect(result.current.isKnown).toBe(true);
  });

  it('is not known until a remote store has answered', async () => {
    const { storage, deliver } = remoteStorage();
    const { result } = renderWith(storage);

    expect(result.current.isKnown).toBe(false);

    act(() => deliver({ presence: 'present', value: false }));

    await waitFor(() => expect(result.current.isKnown).toBe(true));
    expect(result.current.showToolActivity).toBe(false);
  });

  it('remembers the choice read for the next page in the same app load', async () => {
    const { storage, deliver, state } = remoteStorage();
    const first = renderWith(storage);
    act(() => deliver({ presence: 'present', value: false }));
    await waitFor(() => expect(first.result.current.isKnown).toBe(true));
    first.unmount();

    // The next page's read has not answered yet.
    state.answers = false;
    const { result } = renderWith(storage);

    expect(result.current.isKnown).toBe(true);
    expect(result.current.showToolActivity).toBe(false);
  });

  it('goes on with the default when the store never answers', () => {
    jest.useFakeTimers();
    try {
      const { storage } = remoteStorage();
      const { result } = renderWith(storage);
      expect(result.current.isKnown).toBe(false);

      act(() => {
        jest.advanceTimersByTime(TOOL_ACTIVITY_READ_TIMEOUT_MS);
      });

      expect(result.current.isKnown).toBe(true);
      expect(result.current.showToolActivity).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the requested value while the write is in flight', async () => {
    const { storage, release } = laggingStorage();
    const { result } = renderWith(storage);

    let write: Promise<void> = Promise.resolve();
    act(() => {
      write = result.current.setShowToolActivity(false);
    });
    await waitFor(() => expect(result.current.showToolActivity).toBe(false));
    expect(stored(storage)).toBeUndefined();

    release();
    await act(async () => {
      await write;
    });
    expect(stored(storage)).toBe(false);
    expect(result.current.showToolActivity).toBe(false);
  });
});
