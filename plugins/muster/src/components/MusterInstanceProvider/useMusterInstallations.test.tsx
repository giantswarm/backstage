import { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { MusterApi, musterApiRef } from '../../apis';
import type { MusterInstallationInfo } from '../../apis/types';
import {
  hasUnknownReachability,
  isNotReachable,
  useMusterInstallations,
} from './useMusterInstallations';

function renderInstallations(installations: MusterInstallationInfo[]) {
  const listInstallations = jest.fn(async () => ({ installations }));
  const musterApi = { listInstallations } as unknown as MusterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    listInstallations,
    ...renderHook(() => useMusterInstallations(), { wrapper }),
  };
}

describe('useMusterInstallations', () => {
  it('lists the backend installations and tells the unreachable ones apart', async () => {
    const { result, listInstallations } = renderInstallations([
      { name: 'gazelle', requiresAuth: true, reachable: true },
      {
        name: 'wombat',
        requiresAuth: true,
        reachable: false,
        reason: 'no answer within 3000 ms',
      },
      // An older backend without the probe: not acted on.
      { name: 'golem', requiresAuth: true },
    ]);

    expect(result.current.isLoading).toBe(true);
    expect(result.current.installations).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listInstallations).toHaveBeenCalledTimes(1);
    expect(result.current.installations.map(i => i.name)).toEqual([
      'gazelle',
      'wombat',
      'golem',
    ]);
    expect(result.current.isNotReachable('wombat')).toBe(true);
    expect(result.current.isNotReachable('gazelle')).toBe(false);
    expect(result.current.isNotReachable('golem')).toBe(false);
    expect(result.current.isNotReachable('unknown-name')).toBe(false);
  });
});

describe('isNotReachable', () => {
  it('acts on `false` only', () => {
    expect(isNotReachable({ reachable: false })).toBe(true);
    expect(isNotReachable({ reachable: true })).toBe(false);
    expect(isNotReachable({ reachable: 'unknown' })).toBe(false);
    expect(isNotReachable({})).toBe(false);
    expect(isNotReachable(undefined)).toBe(false);
  });
});

describe('hasUnknownReachability', () => {
  it('is true while any installation has not been probed', () => {
    expect(
      hasUnknownReachability([
        { name: 'gazelle', requiresAuth: true, reachable: true },
        { name: 'wombat', requiresAuth: true, reachable: 'unknown' },
      ]),
    ).toBe(true);
    expect(
      hasUnknownReachability([
        { name: 'gazelle', requiresAuth: true, reachable: true },
        { name: 'wombat', requiresAuth: true, reachable: false },
      ]),
    ).toBe(false);
    expect(hasUnknownReachability([])).toBe(false);
    expect(hasUnknownReachability(undefined)).toBe(false);
  });
});
