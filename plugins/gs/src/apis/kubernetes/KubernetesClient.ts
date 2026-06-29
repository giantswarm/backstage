import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
  KubernetesBackendClient,
} from '@backstage/plugin-kubernetes-react';
import { ClusterConfiguration } from './types';
import { ConfigApi, FetchApi } from '@backstage/core-plugin-api';
import {
  CustomObjectsByEntityRequest,
  KubernetesRequestBody,
  ObjectsByEntityResponse,
  WorkloadsByEntityRequest,
} from '@backstage/plugin-kubernetes-common';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';

/**
 * Default per-request timeout for the k8s proxy. An unreachable management
 * cluster otherwise keeps the request in-flight until the backend's TCP/DNS
 * timeout (minutes), which freezes the whole clusters list. Bounding it here
 * turns a hung cluster into a fast, typed per-cluster error. Override with
 * `gs.kubernetes.proxyTimeoutMs`.
 */
const DEFAULT_PROXY_TIMEOUT_MS = 10000;

/**
 * Default cap on simultaneous in-flight proxy requests across the whole app.
 * With every configured installation kicking off discovery + list (and a
 * broker token mint) at once, an unbounded fan-out hammers the broker and the
 * management-cluster apiservers, so some requests hit the proxy timeout before
 * recovering on retry. Bounding concurrency smooths that storm. The browser's
 * own per-host connection limit is ~6, so this matches the level at which
 * extra parallelism stops helping. Override with `gs.kubernetes.proxyMaxConcurrency`.
 */
const DEFAULT_PROXY_MAX_CONCURRENCY = 6;

export class KubernetesClient implements KubernetesApi {
  private readonly backendClient: KubernetesBackendClient;
  private readonly configApi: ConfigApi;
  private readonly discoveryApi: DiscoveryApiClient;
  private readonly fetchApi: FetchApi;
  private readonly kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  private readonly proxyTimeoutMs: number;
  private readonly proxyMaxConcurrency: number;
  private activeProxyRequests = 0;
  // Foreground (page) reads are served before background warm-up probes so a
  // single-cluster read is never serialized behind the whole-fleet warm-up.
  private readonly proxyQueue: Array<() => void> = [];
  private readonly proxyBackgroundQueue: Array<() => void> = [];
  private clusters: ClusterConfiguration[] | undefined;

  constructor(options: {
    configApi: ConfigApi;
    discoveryApi: DiscoveryApiClient;
    fetchApi: FetchApi;
    kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  }) {
    this.backendClient = new KubernetesBackendClient({
      discoveryApi: options.discoveryApi,
      fetchApi: options.fetchApi,
      kubernetesAuthProvidersApi: options.kubernetesAuthProvidersApi,
    });

    this.configApi = options.configApi;
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.kubernetesAuthProvidersApi = options.kubernetesAuthProvidersApi;
    this.proxyTimeoutMs =
      options.configApi.getOptionalNumber('gs.kubernetes.proxyTimeoutMs') ??
      DEFAULT_PROXY_TIMEOUT_MS;
    this.proxyMaxConcurrency =
      options.configApi.getOptionalNumber(
        'gs.kubernetes.proxyMaxConcurrency',
      ) ?? DEFAULT_PROXY_MAX_CONCURRENCY;
  }

  /**
   * Bounds simultaneous proxy requests. A released slot is handed directly to
   * the next waiter, so the active count never dips below the number of
   * in-flight requests and the cap holds exactly.
   *
   * Foreground requests (the default) are queued ahead of background warm-up
   * probes: when a slot frees, a waiting foreground request is always served
   * before any background one. This is what keeps a single-cluster page read
   * from being serialized behind the whole-fleet cluster-access warm-up, which
   * fires first on app load and would otherwise fill the queue.
   *
   * ponytail: a plain counter + two FIFO queues of resolvers. Single-tab,
   * in-memory, no fairness beyond foreground-before-background FIFO -- enough
   * to tame the startup fan-out without a real scheduler.
   */
  private async acquireProxySlot(background: boolean): Promise<void> {
    if (this.activeProxyRequests < this.proxyMaxConcurrency) {
      this.activeProxyRequests++;
      return;
    }
    const queue = background ? this.proxyBackgroundQueue : this.proxyQueue;
    await new Promise<void>(resolve => queue.push(resolve));
  }

  private releaseProxySlot(): void {
    const next = this.proxyQueue.shift() ?? this.proxyBackgroundQueue.shift();
    if (next) {
      next();
    } else {
      this.activeProxyRequests--;
    }
  }

  getObjectsByEntity(
    requestBody: KubernetesRequestBody,
  ): Promise<ObjectsByEntityResponse> {
    return this.backendClient.getObjectsByEntity(requestBody);
  }

  getWorkloadsByEntity(
    request: WorkloadsByEntityRequest,
  ): Promise<ObjectsByEntityResponse> {
    return this.backendClient.getWorkloadsByEntity(request);
  }

  getCustomObjectsByEntity(
    request: CustomObjectsByEntityRequest,
  ): Promise<ObjectsByEntityResponse> {
    return this.backendClient.getCustomObjectsByEntity(request);
  }

  async getCluster(
    clusterName: string,
  ): Promise<ClusterConfiguration | undefined> {
    const clusters = await this.getClusters();
    return clusters.find(cluster => cluster.name === clusterName);
  }

  getClusters(): Promise<ClusterConfiguration[]> {
    if (this.clusters) {
      return Promise.resolve(this.clusters);
    }

    const installationsConfig =
      this.configApi.getOptionalConfig('gs.installations');
    if (!installationsConfig) {
      throw new Error(`Missing gs.installations configuration`);
    }

    const installations = this.configApi.getConfig('gs.installations').keys();
    this.clusters = installations.map(installation => {
      const installationConfig = installationsConfig.getConfig(installation);
      return {
        name: installation,
        authProvider: installationConfig.getString('authProvider'),
        oidcTokenProvider:
          installationConfig.getOptionalString('oidcTokenProvider'),
      };
    });

    return Promise.resolve(this.clusters);
  }

  private async getCredentials(
    authProvider: string,
    oidcTokenProvider?: string,
  ): Promise<{ token?: string }> {
    return await this.kubernetesAuthProvidersApi.getCredentials(
      authProvider === 'oidc'
        ? `${authProvider}.${oidcTokenProvider}`
        : authProvider,
    );
  }

  async proxy(options: {
    clusterName: string;
    path: string;
    init?: RequestInit;
    /**
     * Marks the request as a background warm-up (e.g. the fleet cluster-access
     * `/version` probe). Background requests yield to foreground page reads in
     * the concurrency queue, so a single-cluster read is never serialized
     * behind the whole-fleet warm-up. Defaults to false (foreground).
     */
    background?: boolean;
    /**
     * Per-request timeout override in ms. Defaults to `gs.kubernetes.proxyTimeoutMs`.
     * Background probes use a short timeout so an unreachable cluster releases
     * its slot quickly instead of holding it for the full default timeout.
     */
    timeoutMs?: number;
  }): Promise<Response> {
    // Wait for a concurrency slot before doing anything (including the broker
    // token mint), so the whole connection is throttled, not just the fetch.
    // Queue time deliberately does not count against the per-request timeout,
    // which starts only once a slot is held.
    await this.acquireProxySlot(options.background ?? false);
    try {
      const cluster = await this.getCluster(options.clusterName);
      if (!cluster) {
        throw new Error(`Cluster ${options.clusterName} not found`);
      }
      const { authProvider, oidcTokenProvider } = cluster;
      const kubernetesCredentials = await this.getCredentials(
        authProvider,
        oidcTokenProvider,
      );
      const url = `${await this.discoveryApi.getBaseUrl('kubernetes', cluster.name)}/proxy${
        options.path
      }`;
      const headers = KubernetesClient.getKubernetesHeaders(
        options,
        kubernetesCredentials?.token,
        authProvider,
        oidcTokenProvider,
      );

      // Bound the request so an unreachable cluster fails fast instead of
      // hanging the whole list. The caller's own signal (if any) still aborts.
      const timeoutMs = options.timeoutMs ?? this.proxyTimeoutMs;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const callerSignal = options.init?.signal;
      const onCallerAbort = () => controller.abort();
      if (callerSignal) {
        if (callerSignal.aborted) {
          controller.abort();
        } else {
          callerSignal.addEventListener('abort', onCallerAbort);
        }
      }

      try {
        return await this.fetchApi.fetch(url, {
          ...options.init,
          headers,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted && !callerSignal?.aborted) {
          throw new Error(
            `Request to cluster ${cluster.name} timed out after ${timeoutMs}ms`,
          );
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        if (callerSignal) {
          callerSignal.removeEventListener('abort', onCallerAbort);
        }
      }
    } finally {
      this.releaseProxySlot();
    }
  }

  private static getKubernetesHeaders(
    options: {
      clusterName: string;
      path: string;
      init?: RequestInit;
    },
    k8sToken: string | undefined,
    authProvider: string,
    oidcTokenProvider: string | undefined,
  ) {
    const kubernetesAuthHeader =
      KubernetesClient.getKubernetesAuthHeaderByAuthProvider(
        authProvider,
        oidcTokenProvider,
      );
    return {
      ...options.init?.headers,
      [`Backstage-Kubernetes-Cluster`]: options.clusterName,
      ...(k8sToken && {
        [kubernetesAuthHeader]: k8sToken,
      }),
    };
  }

  private static getKubernetesAuthHeaderByAuthProvider(
    authProvider: string,
    oidcTokenProvider: string | undefined,
  ): string {
    let header: string = 'Backstage-Kubernetes-Authorization';

    header = header.concat('-', authProvider);

    if (oidcTokenProvider) header = header.concat('-', oidcTokenProvider);

    return header;
  }
}
