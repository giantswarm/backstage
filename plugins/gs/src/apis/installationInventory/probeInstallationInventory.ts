import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import type { KubernetesClient } from '../kubernetes/KubernetesClient';
import { parseApiGroupList } from './parseApiGroupList';
import type { PlatformComponents } from './types';

/** `GET /apis`: the API group list, one request per installation. */
export const INVENTORY_PROBE_PATH = '/apis';

/**
 * Error names the kubernetes-react reads use for the same statuses, so the
 * QueryClientProviders' retry predicates decline to retry them here too.
 */
function errorNameForStatus(status: number): string | undefined {
  switch (status) {
    case 401:
      return 'UnauthorizedError';
    case 403:
      return 'ForbiddenError';
    case 404:
      return 'NotFoundError';
    case 503:
      return 'ServiceUnavailableError';
    default:
      return undefined;
  }
}

/**
 * Asks one installation which platform components it runs.
 *
 * `/apis` is served to any authenticated caller, so a 403 or a 404 here is
 * not "no components": the proxy or the apiserver did not answer the question,
 * and the probe fails with the error. Reading it as an empty inventory would
 * hide every tab for that installation without a word.
 *
 * `background` puts the request on the kubernetes client's background lane,
 * behind foreground page reads (`KubernetesClient.acquireProxySlot`). The home
 * installation is probed in the foreground, every other one in the background.
 * The Backstage `KubernetesApi` type does not carry the flag; the gs
 * `KubernetesClient` behind `kubernetesApiRef` does, hence the cast.
 */
export async function probeInstallationInventory(
  kubernetesApi: KubernetesApi,
  installation: string,
  options: { background: boolean },
): Promise<PlatformComponents> {
  const response = await kubernetesApi.proxy({
    clusterName: installation,
    path: INVENTORY_PROBE_PATH,
    background: options.background,
  } as Parameters<KubernetesClient['proxy']>[0]);

  if (!response.ok) {
    // HTTP/2 responses carry no reason phrase; fall back to the status code.
    const reason = response.statusText || `HTTP ${response.status}`;
    const error = new Error(
      `Failed to read the API groups of ${installation} (GET ${INVENTORY_PROBE_PATH}). Reason: ${reason}.`,
    );
    const name = errorNameForStatus(response.status);
    if (name) {
      error.name = name;
    }
    throw error;
  }

  return parseApiGroupList(await response.json());
}
