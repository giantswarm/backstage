import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../lib/k8s/App';
import { useResources } from './useResources';

describe('useResources', () => {
  it('makes no request at all, discovery included, when disabled', async () => {
    const proxy = jest.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[kubernetesApiRef, { proxy } as any]]}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TestApiProvider>
    );

    const { result } = renderHook(
      () => useResources(['cluster-a'], App, {}, { enabled: false }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(proxy).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual([]);
  });
});
