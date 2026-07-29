import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import { getK8sGetPath } from './k8sPath';

/**
 * The `metadata.managedFields` manager name recorded for writes made from here.
 *
 * Set explicitly because the apiserver otherwise derives the manager from the
 * request's User-Agent — which, for a write proxied through the Backstage
 * backend, is both unpredictable and useless in an audit trail. A deliberate name
 * makes our writes attributable in `kubectl get ... --show-managed-fields`, and
 * gives cluster operators a value they can pass to a controller's
 * `--override-manager` if they want these changes force-reverted.
 *
 * Note we deliberately do *not* masquerade as `flux`. Nothing in Flux keys off
 * that name — the CLI never sets a field manager at all, and
 * kustomize-controller's disallowed-manager list does not mention it — so
 * impersonating it would buy nothing and destroy attribution.
 */
export const BACKSTAGE_FIELD_MANAGER = 'giantswarm-backstage';

/**
 * Reads succeed with the trailing slash `k8sUrl.create` appends, but we do not
 * want to rely on the apiserver tolerating it for a mutating verb.
 */
function stripTrailingSlash(path: string): string {
  return path.replace(/\/$/, '');
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();

    if (typeof body?.message === 'string') {
      return body.message;
    }
  } catch {
    // Not a Kubernetes Status object — fall back to the status text.
  }

  return response.statusText;
}

/**
 * Applies a JSON merge patch to a single Kubernetes resource through the
 * Kubernetes proxy.
 *
 * Authorization is the signed-in user's own RBAC on the target cluster: the
 * backend proxy forwards their OIDC token, so a rejected patch surfaces as a
 * 403 (`ForbiddenError`) from the apiserver.
 */
export async function patchResource(options: {
  kubernetesApi: KubernetesApi;
  cluster: string;
  gvk: CustomResourceMatcher;
  name: string;
  namespace?: string;
  patch: object;
}): Promise<void> {
  const { kubernetesApi, cluster, gvk, name, namespace, patch } = options;
  const path = `${stripTrailingSlash(
    getK8sGetPath(gvk, name, namespace),
  )}?fieldManager=${encodeURIComponent(BACKSTAGE_FIELD_MANAGER)}`;

  const response = await kubernetesApi.proxy({
    clusterName: cluster,
    path,
    init: {
      method: 'PATCH',
      // Must be a plain object: `KubernetesClient.getKubernetesHeaders`
      // object-spreads these, and a `Headers` instance spreads to `{}`, which
      // would silently drop the content type.
      headers: {
        'Content-Type': 'application/merge-patch+json',
      },
      body: JSON.stringify(patch),
    },
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    const error = new Error(
      `Failed to patch ${gvk.plural} ${name} on ${cluster}. Reason: ${message}.`,
    );
    error.name = response.status === 403 ? 'ForbiddenError' : error.name;
    error.name = response.status === 404 ? 'NotFoundError' : error.name;

    throw error;
  }
}
