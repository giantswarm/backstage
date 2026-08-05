import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import {
  BACKSTAGE_FIELD_MANAGER,
  k8sMutationError,
  stripTrailingSlash,
} from './k8sMutation';
import { getK8sGetPath } from './k8sPath';

// Re-exported because this used to be its definition site, and it is part of the
// package's public surface.
export { BACKSTAGE_FIELD_MANAGER };

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
    throw await k8sMutationError(
      response,
      `Failed to patch ${gvk.plural} ${name} on ${cluster}`,
    );
  }
}
