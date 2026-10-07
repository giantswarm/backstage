import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { RepositoriesApi, repositoriesApiRef } from '../apis';
import { useTeamOptions } from './useTeamOptions';

describe('useTeamOptions', () => {
  afterEach(() => focusManager.setFocused(undefined));

  it('stays loading while the retry after a 500 waits, then offers the teams', async () => {
    // A background tab: react-query pauses the retry until it is focused.
    focusManager.setFocused(false);
    const api = {
      getInfo: jest
        .fn()
        .mockRejectedValueOnce(new Error('500 Internal Server Error'))
        .mockResolvedValue({ teams: [] }),
      listRepositories: jest.fn(async () => ({
        repositories: [{ name: 'backstage', team: 'bumblebee' }],
      })),
    } as unknown as RepositoriesApi;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[repositoriesApiRef, api]]}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </TestApiProvider>
    );
    const { result } = renderHook(() => useTeamOptions(), { wrapper });

    // The first read failed and its retry waits for the tab.
    await waitFor(() =>
      expect(
        client.getQueryCache().findAll({ fetchStatus: 'paused' }),
      ).not.toHaveLength(0),
    );
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeUndefined();

    act(() => focusManager.setFocused(true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.teams.map(team => team.id)).toContain('bumblebee');
  });
});
