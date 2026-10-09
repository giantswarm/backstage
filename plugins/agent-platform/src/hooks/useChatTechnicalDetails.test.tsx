import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { storageApiRef, StorageApi } from '@backstage/core-plugin-api';
import { useChatTechnicalDetails } from './useChatTechnicalDetails';

const BUCKET = 'agent-platform';
const KEY = 'chatTechnicalDetails';

function renderWith(storage: StorageApi) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[storageApiRef, storage]]}>
      {children}
    </TestApiProvider>
  );

  return renderHook(() => useChatTechnicalDetails(), { wrapper });
}

describe('useChatTechnicalDetails', () => {
  it('defaults to plain when nothing is stored', () => {
    const { result } = renderWith(mockApis.storage());

    expect(result.current.isTechnical).toBe(false);
  });

  it('reads a previously stored preference', async () => {
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, true);

    const { result } = renderWith(storage);

    expect(result.current.isTechnical).toBe(true);
  });

  it('persists the preference and reflects it back', async () => {
    const storage = mockApis.storage();
    const { result } = renderWith(storage);

    act(() => result.current.setTechnical(true));

    await waitFor(() => expect(result.current.isTechnical).toBe(true));
    expect(storage.forBucket(BUCKET).snapshot(KEY).value).toBe(true);

    act(() => result.current.setTechnical(false));
    await waitFor(() => expect(result.current.isTechnical).toBe(false));
  });

  it('treats a foreign value in the shared bucket as plain', async () => {
    // The bucket is shared with other portal versions, so a value another
    // version wrote must not be trusted to be a boolean.
    const storage = mockApis.storage();
    await storage.forBucket(BUCKET).set(KEY, { nested: 'object' });

    const { result } = renderWith(storage);

    expect(result.current.isTechnical).toBe(false);
  });
});
