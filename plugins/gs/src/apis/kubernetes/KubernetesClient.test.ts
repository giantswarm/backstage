import { ConfigApi, FetchApi } from '@backstage/core-plugin-api';
import { KubernetesAuthProvidersApi } from '@backstage/plugin-kubernetes-react';
import { KubernetesClient } from './KubernetesClient';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';

function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

/** Fetch mock that never resolves until its signal aborts, then rejects. */
function hangingFetch(): jest.Mock {
  return jest.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          return;
        }
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        signal.addEventListener('abort', () => reject(abortError()));
      }),
  );
}

function createClient(fetch: FetchApi['fetch'], proxyTimeoutMs?: number) {
  const configApi = {
    getOptionalNumber: jest.fn().mockReturnValue(proxyTimeoutMs),
  } as unknown as ConfigApi;
  const discoveryApi = {
    getBaseUrl: jest.fn().mockResolvedValue('http://backend/api/kubernetes'),
  } as unknown as DiscoveryApiClient;
  const fetchApi = { fetch } as unknown as FetchApi;
  const kubernetesAuthProvidersApi = {
    getCredentials: jest.fn().mockResolvedValue({ token: 'k8s-token' }),
  } as unknown as KubernetesAuthProvidersApi;

  const client = new KubernetesClient({
    configApi,
    discoveryApi,
    fetchApi,
    kubernetesAuthProvidersApi,
  });
  // Bypass gs.installations config parsing -- only the timeout behaviour is
  // under test here.
  (client as unknown as { clusters: unknown }).clusters = [
    { name: 'golem', authProvider: 'oidc', oidcTokenProvider: 'golem' },
  ];
  return client;
}

describe('KubernetesClient.proxy', () => {
  it('fails fast with a typed timeout error when a cluster hangs', async () => {
    const client = createClient(hangingFetch(), 10);

    await expect(
      client.proxy({ clusterName: 'golem', path: '/api/v1/namespaces' }),
    ).rejects.toThrow('Request to cluster golem timed out after 10ms');
  });

  it('propagates the caller abort instead of reporting a timeout', async () => {
    const client = createClient(hangingFetch(), 10_000);
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.proxy({
        clusterName: 'golem',
        path: '/api/v1/namespaces',
        init: { signal: controller.signal },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns the response and clears the timeout on success', async () => {
    const response = new Response('{}', { status: 200 });
    const fetch = jest.fn().mockResolvedValue(response);
    const client = createClient(fetch, 10_000);

    await expect(
      client.proxy({ clusterName: 'golem', path: '/api/v1/namespaces' }),
    ).resolves.toBe(response);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
