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
});
