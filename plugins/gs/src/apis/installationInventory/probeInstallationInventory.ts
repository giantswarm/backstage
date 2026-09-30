import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import {
  k8sErrorNameForStatus,
  k8sResponseReason,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import type { KubernetesClient } from '../kubernetes/KubernetesClient';
import { parseApiGroupList } from './parseApiGroupList';
import type { PlatformComponents } from './types';

/** `GET /apis`: the API group list, one request per installation. */
export const INVENTORY_PROBE_PATH = '/apis';

/**
 * The kubernetes-react reads' error name for the status, so the
 * QueryClientProviders' retry predicates decline to retry them here too. The
 * probe also names a 503 `ServiceUnavailableError`, which those reads leave
 * unnamed; the agent-platform and muster QueryClientProviders decline to retry
 * that name, the gs one does not.
 */
function errorNameForStatus(status: number): string | undefined {
  return (
    k8sErrorNameForStatus(status) ??
    (status === 503 ? 'ServiceUnavailableError' : undefined)
  );
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
   * What the response says went wrong (`k8sResponseReason` with the status):
   * `HTTP 403: forbidden: User "jane" cannot get path "/apis"` when the body is
   * a Kubernetes `Status`, otherwise `HTTP 401 Unauthorized`, or `HTTP 401`
   * when there is no reason phrase either (HTTP/2 responses carry none).
   */
  readonly reason: string;

  constructor(installation: string, status: number, reason: string) {
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
      await k8sResponseReason(response, { withStatus: true }),
    );
  }

  return parseApiGroupList(await response.json());
}
