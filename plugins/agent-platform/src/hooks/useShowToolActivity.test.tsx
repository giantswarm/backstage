import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  analyticsApiRef,
  storageApiRef,
  StorageApi,
} from '@backstage/core-plugin-api';
import { useShowToolActivity } from './useShowToolActivity';

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
