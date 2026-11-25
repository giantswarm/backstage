import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useMusterPages } from './useMusterPages';

function renderPages(installations: object[]) {
  const musterApi = {
    listInstallations: () => Promise.resolve({ installations }),
  } as unknown as MusterApi;
  const queryClient = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useMusterPages('gazelle'), { wrapper });
}

describe('useMusterPages', () => {
  it("trusts muster's configured public URL over an endpoint on another host", async () => {
    const { result } = renderPages([
      {
        name: 'gazelle',
        endpoint: 'http://muster.muster.svc:8090/mcp',
        publicUrl: 'https://muster.gazelle.example.test',
        requiresAuth: true,
      },
    ]);

    await waitFor(() =>
      expect(result.current).toEqual({
        origin: 'https://muster.gazelle.example.test',
        basePath: '',
      }),
    );
  });

  it("falls back to the endpoint's host", async () => {
    const { result } = renderPages([
      {
        name: 'gazelle',
        endpoint: 'https://muster.gazelle.example.test/mcp',
        requiresAuth: true,
      },
    ]);

    await waitFor(() =>
      expect(result.current).toEqual({
        origin: 'https://muster.gazelle.example.test',
        basePath: '',
      }),
    );
  });
});
