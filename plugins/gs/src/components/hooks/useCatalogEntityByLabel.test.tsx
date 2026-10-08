import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useCatalogEntityByLabel } from './useCatalogEntityByLabel';

const ENTITY = { kind: 'Component', metadata: { name: 'cluster-aws' } };

describe('useCatalogEntityByLabel', () => {
  afterEach(() => focusManager.setFocused(undefined));

  it('stays loading while the retry after a 500 waits, then finds the entity', async () => {
    // A background tab: react-query pauses the retry until it is focused.
    focusManager.setFocused(false);
    const getEntities = jest
      .fn()
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValue({ items: [ENTITY] });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[catalogApiRef, { getEntities } as any]]}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </TestApiProvider>
    );
    const { result } = renderHook(
      () => useCatalogEntityByLabel({ 'metadata.name': 'cluster-aws' }),
      { wrapper },
    );

    // The first read failed and its retry waits for the tab.
    await waitFor(() =>
      expect(
        client.getQueryCache().findAll({ fetchStatus: 'paused' }),
      ).not.toHaveLength(0),
    );
    expect(result.current).toEqual({ entity: undefined, isLoading: true });

    act(() => focusManager.setFocused(true));

    await waitFor(() =>
      expect(result.current).toEqual({ entity: ENTITY, isLoading: false }),
    );
  });
});
