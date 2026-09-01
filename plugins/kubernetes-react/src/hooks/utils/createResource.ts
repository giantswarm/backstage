import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import {
  BACKSTAGE_FIELD_MANAGER,
  k8sMutationError,
  stripTrailingSlash,
} from './k8sMutation';
import { getK8sCreatePath } from './k8sPath';

/**
 * Creates a single Kubernetes resource through the Kubernetes proxy.
 *
 * Authorization is the signed-in user's own RBAC on the target cluster: the
 * backend proxy forwards their OIDC token, so a rejected create surfaces as a
 * 403 (`ForbiddenError`) from the apiserver. A name collision is a 409
 * (`ConflictError`) — the caller's signal that the name is already taken, which
 * a form can turn into field-level feedback rather than a generic failure.
 */
export async function createResource(options: {
  kubernetesApi: KubernetesApi;
  cluster: string;
  gvk: CustomResourceMatcher;
  namespace?: string;
  manifest: object;
}): Promise<void> {
  const { kubernetesApi, cluster, gvk, namespace, manifest } = options;
  const path = `${stripTrailingSlash(
    getK8sCreatePath(gvk, namespace),
  )}?fieldManager=${encodeURIComponent(BACKSTAGE_FIELD_MANAGER)}`;

  const response = await kubernetesApi.proxy({
    clusterName: cluster,
    path,
    init: {
      method: 'POST',
      // Must be a plain object: `KubernetesClient.getKubernetesHeaders`
      // object-spreads these, and a `Headers` instance spreads to `{}`, which
      // would silently drop the content type.
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(manifest),
    },
  });

  if (!response.ok) {
    throw await k8sMutationError(
      response,
      `Failed to create ${gvk.plural} on ${cluster}`,
    );
  }
}
