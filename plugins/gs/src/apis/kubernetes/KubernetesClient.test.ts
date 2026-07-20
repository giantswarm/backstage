import { ConfigApi, FetchApi } from '@backstage/core-plugin-api';
import { KubernetesAuthProvidersApi } from '@backstage/plugin-kubernetes-react';
import { KubernetesClient } from './KubernetesClient';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from '../installations';

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

function createClient(
  fetch: FetchApi['fetch'],
  proxyTimeoutMs?: number,
  proxyMaxConcurrency?: number,
) {
  const configApi = {
    getOptionalNumber: jest.fn((key: string) =>
      key === 'gs.kubernetes.proxyMaxConcurrency'
        ? proxyMaxConcurrency
        : proxyTimeoutMs,
    ),
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

  it('bounds the number of simultaneous in-flight proxy requests', async () => {
    let activeFetches = 0;
    let maxObserved = 0;
    const release: Array<() => void> = [];
    const fetch = jest.fn(() => {
      activeFetches++;
      maxObserved = Math.max(maxObserved, activeFetches);
      return new Promise<Response>(resolve => {
        release.push(() => {
          activeFetches--;
          resolve(new Response('{}', { status: 200 }));
        });
      });
    });

    // Cap concurrency at 2; fire four requests at once.
    const client = createClient(fetch, 10_000, 2);
    const calls = [0, 1, 2, 3].map(() =>
      client.proxy({ clusterName: 'golem', path: '/version' }),
    );

    // Let the first batch start.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(2);

    // Drain: each release frees a slot for the next queued request. Loop with
    // macrotask ticks so queued requests have time to acquire and fetch.
    for (
      let i = 0;
      i < 20 && (fetch.mock.calls.length < 4 || release.length > 0);
      i++
    ) {
      if (release.length > 0) {
        release.shift()!();
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    await Promise.all(calls);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(maxObserved).toBe(2);
  });

  it('uses the per-request timeout override instead of the default', async () => {
    const client = createClient(hangingFetch(), 10_000);

    await expect(
      client.proxy({
        clusterName: 'golem',
        path: '/version',
        timeoutMs: 5,
      }),
    ).rejects.toThrow('Request to cluster golem timed out after 5ms');
  });

  it('serves a foreground read before a queued background warm-up probe', async () => {
    const started: string[] = [];
    const release: Array<() => void> = [];
    const fetch = jest.fn((url: string | URL | Request) => {
      started.push(String(url));
      return new Promise<Response>(resolve => {
        release.push(() => resolve(new Response('{}', { status: 200 })));
      });
    });

    // Cap concurrency at 1 so the serving order is observable.
    const client = createClient(fetch, 10_000, 1);

    // A background probe takes the only slot.
    const calls = [
      client.proxy({
        clusterName: 'golem',
        path: '/bg-a',
        background: true,
      }),
    ];
    await new Promise(resolve => setTimeout(resolve, 0));

    // A second background probe and a foreground read queue behind it.
    calls.push(
      client.proxy({
        clusterName: 'golem',
        path: '/bg-b',
        background: true,
      }),
      client.proxy({ clusterName: 'golem', path: '/fg' }),
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(started).toEqual(['http://backend/api/kubernetes/proxy/bg-a']);

    // Freeing the slot serves the foreground read ahead of the queued
    // background probe, even though the background probe was enqueued first.
    release.shift()!();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(started[1]).toBe('http://backend/api/kubernetes/proxy/fg');

    // Drain the remaining work.
    for (let i = 0; i < 5 && release.length > 0; i++) {
      release.shift()!();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await Promise.all(calls);
    expect(started[2]).toBe('http://backend/api/kubernetes/proxy/bg-b');
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

describe('KubernetesClient.getClusters', () => {
  beforeEach(() => {
    __resetInstallationsConfigForTests();
  });

  afterEach(() => {
    __resetInstallationsConfigForTests();
  });

  it('derives clusters from the async installations source', async () => {
    const client = createClient(jest.fn());
    // createClient stubs `clusters` to isolate proxy tests; clear it so
    // getClusters reads from the installations source instead.
    (client as unknown as { clusters: unknown }).clusters = undefined;

    setInstallationsConfig([
      { name: 'golem', authProvider: 'oidc', oidcTokenProvider: 'oidc-golem' },
      { name: 'gaggle', authProvider: 'oidc' },
    ]);

    await expect(client.getClusters()).resolves.toEqual([
      { name: 'golem', authProvider: 'oidc', oidcTokenProvider: 'oidc-golem' },
      { name: 'gaggle', authProvider: 'oidc', oidcTokenProvider: undefined },
    ]);
  });

  it('waits for the source when installations load after the call', async () => {
    const client = createClient(jest.fn());
    (client as unknown as { clusters: unknown }).clusters = undefined;

    const pending = client.getClusters();
    setInstallationsConfig([{ name: 'golem', authProvider: 'oidc' }]);

    await expect(pending).resolves.toEqual([
      { name: 'golem', authProvider: 'oidc', oidcTokenProvider: undefined },
    ]);
  });
});
