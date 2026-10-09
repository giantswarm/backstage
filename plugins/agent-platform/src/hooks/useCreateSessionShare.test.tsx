import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import {
  InvalidateQueryFilters,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { useCreateSessionShare } from './useCreateSessionShare';

const createSessionShare = jest.fn();

const kagentApi = { createSessionShare } as unknown as KagentApi;

const analyticsApi = mockApis.analytics.mock();

const SHARES_KEY = [
  'agent-platform',
  'kagent',
  'session-shares',
  'gazelle',
  'abc',
];

function renderWith() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');

  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [kagentApiRef, kagentApi],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );

  return {
    ...renderHook(() => useCreateSessionShare('gazelle', 'abc'), { wrapper }),
    invalidateQueries,
  };
}

function invalidationFor(
  invalidateQueries: jest.SpyInstance,
  queryKey: unknown[],
): InvalidateQueryFilters | undefined {
  const call = invalidateQueries.mock.calls.find(
    ([filters]) =>
      JSON.stringify(filters?.queryKey) === JSON.stringify(queryKey),
  );
  return call?.[0];
}

beforeEach(() => {
  jest.mocked(analyticsApi.captureEvent).mockClear();
  createSessionShare.mockReset();
  createSessionShare.mockResolvedValue({
    token: 'secret-token',
    share: { id: 'share-1', permission: 'read-only' },
  });
});

describe('useCreateSessionShare', () => {
  it('creates the share on the session it was opened for, mapping the TTL choice to seconds', async () => {
    const { result } = renderWith();

    await act(async () => {
      await result.current.createShare({ permission: 'read-only', ttl: '24h' });
    });

    expect(createSessionShare).toHaveBeenCalledWith('gazelle', 'abc', {
      permission: 'read-only',
      ttlSeconds: 24 * 60 * 60,
    });
  });

  it('sends no TTL for the installation-default choice', async () => {
    // Unset is the controller's own maximum share lifetime — a number this
    // frontend cannot know, so it must not invent one.
    const { result } = renderWith();

    await act(async () => {
      await result.current.createShare({
        permission: 'read-write',
        ttl: 'default',
      });
    });

    expect(createSessionShare).toHaveBeenCalledWith('gazelle', 'abc', {
      permission: 'read-write',
    });
  });

  it('keeps the token on the mutation for the dialog, and reset drops it', async () => {
    const { result } = renderWith();

    await act(async () => {
      await result.current.createShare({ permission: 'read-only', ttl: '1h' });
    });
    await waitFor(() =>
      expect(result.current.created?.token).toBe('secret-token'),
    );

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.created).toBeUndefined());
  });

  it('refetches the shares list, which the open dialog is showing', async () => {
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.createShare({ permission: 'read-only', ttl: '7d' });
    });

    const filters = invalidationFor(invalidateQueries, SHARES_KEY);
    expect(filters).toBeDefined();
    expect(filters?.refetchType).toBeUndefined();
  });

  it('reports the created share with its permission and TTL choice', async () => {
    const { result } = renderWith();

    await act(async () => {
      await result.current.createShare({ permission: 'read-only', ttl: '24h' });
    });

    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.sessionShared',
        attributes: { permission: 'read-only', ttl: '24h' },
      }),
    );
  });

  it('reports nothing when the create failed', async () => {
    createSessionShare.mockRejectedValue(new Error('refused'));
    const { result } = renderWith();

    await act(async () => {
      await result.current
        .createShare({ permission: 'read-only', ttl: '24h' })
        .catch(() => {});
    });

    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.error?.message).toBe('refused'));
  });
});
