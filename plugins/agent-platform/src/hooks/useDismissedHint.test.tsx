import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { storageApiRef, StorageApi } from '@backstage/core-plugin-api';
import { useDismissedHint } from './useDismissedHint';

const BUCKET = 'agent-platform';
const KEY = 'dismissedHints';

function renderWith(storage: StorageApi, hintId = 'slackPromo') {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[storageApiRef, storage]]}>
      {children}
    </TestApiProvider>
  );

  return renderHook(() => useDismissedHint(hintId), { wrapper });
}

describe('useDismissedHint', () => {
  it('is not dismissed when nothing is stored', () => {
    const { result } = renderWith(mockApis.storage());

    expect(result.current.dismissed).toBe(false);
    expect(result.current.isKnown).toBe(true);
  });

  it('stores the dismissal next to the other dismissed hints', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, ['otherTip']);
    const { result } = renderWith(storage);

    await act(async () => {
      await result.current.dismiss();
    });

    expect(storage.forBucket(BUCKET).snapshot(KEY).value).toEqual([
      'otherTip',
      'slackPromo',
    ]);
    await waitFor(() => expect(result.current.dismissed).toBe(true));
  });

  it('reads a dismissal stored earlier', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, ['slackPromo']);

    const { result } = renderWith(storage);

    expect(result.current.dismissed).toBe(true);
  });

  it('ignores malformed stored values', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, { slackPromo: true });

    const { result } = renderWith(storage);

    expect(result.current.dismissed).toBe(false);
  });

  it('keeps both of two hints dismissed in quick succession', async () => {
    // A bucket whose writes land only once released, like UserSettingsStorage's.
    const inner = mockApis.storage().forBucket(BUCKET);
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const storage = {
      forBucket: () => storage,
      snapshot: (key: string) => inner.snapshot(key),
      observe$: (key: string) => inner.observe$(key),
      remove: (key: string) => inner.remove(key),
      set: async (key: string, value: never) => {
        await gate;
        await inner.set(key, value);
      },
    } as unknown as StorageApi;
    const promo = renderWith(storage, 'slackPromo');
    const tip = renderWith(storage, 'agentsTip');

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = promo.result.current.dismiss();
      second = tip.result.current.dismiss();
    });
    release();
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(inner.snapshot(KEY).value).toEqual(['slackPromo', 'agentsTip']);
  });
});
