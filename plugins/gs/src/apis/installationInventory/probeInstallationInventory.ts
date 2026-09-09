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
 * The names of a probe the API server (or the proxy in front of it) refused
 * for want of a valid token or a permission.
 */
const AUTH_ERROR_NAMES: ReadonlySet<string> = new Set([
  'UnauthorizedError',
  'ForbiddenError',
]);

/**
 * The probe's answer was an HTTP error. `name` follows the kubernetes-react
 * reads (`UnauthorizedError` for a 401, and so on), so the
 * QueryClientProviders' retry predicates decline to retry it; `status` and
 * `reason` let the gates quote what happened.
 */
export class InventoryProbeError extends Error {
  readonly installation: string;
  readonly status: number;
  /**
   * `HTTP 401 Unauthorized`, or `HTTP 401` when the response carried no
   * reason phrase (HTTP/2 responses never do).
   */
  readonly reason: string;

  constructor(installation: string, status: number, statusText: string) {
    const reason = statusText
      ? `HTTP ${status} ${statusText}`
      : `HTTP ${status}`;
    super(
      `Failed to read the API groups of ${installation} (GET ${INVENTORY_PROBE_PATH}). Reason: ${reason}.`,
    );
    this.name = errorNameForStatus(status) ?? 'InventoryProbeError';
    this.installation = installation;
    this.status = status;
    this.reason = reason;
  }
}

/**
 * Whether a probe failed because the API server (or the proxy in front of it)
 * refused the caller -- a 401 or a 403. Such a failure does not change until
 * the person signs in again or is granted access, so nothing re-runs the probe
 * on its own (see `useInstallationInventory`).
 */
export function isInventoryAuthError(error: unknown): boolean {
  return error instanceof Error && AUTH_ERROR_NAMES.has(error.name);
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
    throw new InventoryProbeError(
      installation,
      response.status,
      response.statusText,
    );
  }

  return parseApiGroupList(await response.json());
}
