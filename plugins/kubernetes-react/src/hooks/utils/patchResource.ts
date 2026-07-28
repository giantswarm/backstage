import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import { getK8sGetPath } from './k8sPath';

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
  const path = stripTrailingSlash(getK8sGetPath(gvk, name, namespace));

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
