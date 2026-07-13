import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { ConfigReader } from '@backstage/config';
import { TestApiProvider } from '@backstage/test-utils';
import { useAgentChart } from './useAgentChart';

const SCHEMA_URL =
  'https://raw.githubusercontent.com/giantswarm/agent/v0.2.0/helm/agent/values.schema.json';

function makeFetch(overrides?: { latestStableVersion?: string | null }) {
  return jest.fn(async (url: string) => {
    if (url.includes('/container-registry/tags')) {
      return {
        ok: true,
        json: async () => ({
          tags: [],
          latestStableVersion:
            overrides?.latestStableVersion === undefined
              ? '0.2.0'
              : overrides.latestStableVersion,
        }),
      } as Response;
    }
    if (url.includes('/container-registry/tag-manifest')) {
      return {
        ok: true,
        json: async () => ({
          annotations: {
            'io.giantswarm.application.values-schema': SCHEMA_URL,
          },
        }),
      } as Response;
    }
    if (url.includes('/github/raw-content')) {
      // The values.yaml URL is derived from the schema URL.
      expect(decodeURIComponent(url)).toContain('helm/agent/values.yaml');
      return {
        ok: true,
        text: async () =>
          'agent:\n  systemMessage: |\n    You are a helpful agent.\n',
      } as Response;
    }
    throw new Error(`unexpected url ${url}`);
  });
}

function renderWith(fetchFn: jest.Mock) {
  const configApi = new ConfigReader({
    agentPlatform: {
      chart: {
        ociUrl: 'oci://gsoci.azurecr.io/charts/giantswarm/agent',
        version: '0.1.0',
      },
    },
  });
  const discoveryApi = {
    getBaseUrl: async () => 'http://backend/api/gs',
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <QueryClientProvider client={queryClient}>
      <TestApiProvider
        apis={[
          [configApiRef, configApi],
          [discoveryApiRef, discoveryApi],
          [fetchApiRef, { fetch: fetchFn }],
        ]}
      >
        {children}
      </TestApiProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useAgentChart(), { wrapper });
}

describe('useAgentChart', () => {
  it('resolves the latest tag and the chart default system prompt', async () => {
    const { result } = renderWith(makeFetch());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.version).toBe('0.2.0');
    expect(result.current.defaultSystemMessage).toBe(
      'You are a helpful agent.',
    );
    expect(result.current.error).toBeNull();
  });

  it('falls back to the configured version when no stable tag is published', async () => {
    const { result } = renderWith(makeFetch({ latestStableVersion: null }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.version).toBe('0.1.0');
    expect(result.current.defaultSystemMessage).toBe(
      'You are a helpful agent.',
    );
  });
});
