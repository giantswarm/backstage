import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { discoveryApiRef, fetchApiRef } from '@backstage/frontend-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EpicRef } from '../../apis';
import { EpicBoardItem, useEpicBoardItem } from './useEpicBoardItem';

const epic: EpicRef = {
  owner: 'giant swarm',
  repo: 'giantswarm',
  number: 37164,
  url: 'https://github.com/giantswarm/giantswarm/issues/37164',
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function renderWith(fetchFn: jest.Mock) {
  const discoveryApi = {
    getBaseUrl: jest.fn().mockResolvedValue('http://backstage/api/roadmap'),
  };
  const fetchApi = { fetch: fetchFn as unknown as typeof fetch };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <QueryClientProvider client={queryClient}>
      <TestApiProvider
        apis={[
          [discoveryApiRef, discoveryApi],
          [fetchApiRef, fetchApi],
        ]}
      >
        {children}
      </TestApiProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useEpicBoardItem(epic), { wrapper });
}

describe('useEpicBoardItem', () => {
  it('unwraps the { item } envelope and calls the URL-encoded by-issue path', async () => {
    const item: EpicBoardItem = {
      id: 'PVTI_1',
      title: 'My epic',
      assignees: ['alice'],
      fields: { Status: 'In progress' },
    };
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ item }));

    const { result } = renderWith(fetchFn);

    await waitFor(() => expect(result.current.data).toEqual(item));
    // The owner segment has a space, so it must arrive percent-encoded.
    expect(fetchFn).toHaveBeenCalledWith(
      'http://backstage/api/roadmap/items/by-issue/giant%20swarm/giantswarm/37164',
    );
  });

  it('leaves data undefined when the roadmap backend is unavailable', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(jsonResponse(undefined, false, 404));

    const { result } = renderWith(fetchFn);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
