import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  MusterApi,
  musterApiRef,
  type MusterServerInfoResponse,
} from '../../apis';
import { useMusterIcon } from './useMusterIcon';

const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';

function renderIcon(answer: MusterServerInfoResponse, enabled = true) {
  const getServerInfo = jest.fn(async () => answer);
  const musterApi = { getServerInfo } as unknown as MusterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  const hook = renderHook(() => useMusterIcon('gazelle', enabled), {
    wrapper,
  });
  const query = () =>
    queryClient
      .getQueryCache()
      .find({ queryKey: ['muster', 'server-info', 'gazelle'] });
  return { ...hook, getServerInfo, query };
}

describe('useMusterIcon', () => {
  it('answers the icon muster announces and keeps it', async () => {
    const { result, query } = renderIcon({ icon: SVG });

    await waitFor(() => expect(result.current).toBe(SVG));
    expect(query()?.isStale()).toBe(false);
  });

  it('keeps the answer of a muster that announces none', async () => {
    const { result, query, getServerInfo } = renderIcon({});

    await waitFor(() => expect(getServerInfo).toHaveBeenCalled());
    await waitFor(() => expect(query()?.state.status).toBe('success'));
    expect(result.current).toBeUndefined();
    expect(query()?.isStale()).toBe(false);
  });

  it('asks again soon when muster could not be asked', async () => {
    const { result, query } = renderIcon({ unavailable: true });

    await waitFor(() => expect(query()?.state.status).toBe('success'));
    expect(result.current).toBeUndefined();
    // Stale at once: the next mount or focus reads it again.
    expect(query()?.isStale()).toBe(true);
  });

  it('does not ask without a session', () => {
    const { result, getServerInfo } = renderIcon({ icon: SVG }, false);

    expect(result.current).toBeUndefined();
    expect(getServerInfo).not.toHaveBeenCalled();
  });
});
