import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import { k8sMutationError, stripTrailingSlash } from './k8sMutation';
import { getK8sGetPath } from './k8sPath';

/**
 * How the apiserver treats dependents of the deleted object. Omitted by default,
 * which leaves the choice to the object's own
 * `metadata.deletionPropagation`/apiserver default (`Background` for the CRs we
 * delete) — the right answer whenever a controller, not us, owns the cascade.
 */
export type PropagationPolicy = 'Foreground' | 'Background' | 'Orphan';

/**
 * Deletes a single Kubernetes resource through the Kubernetes proxy.
 *
 * Authorization is the signed-in user's own RBAC on the target cluster: the
 * backend proxy forwards their OIDC token, so a rejected delete surfaces as a
 * 403 (`ForbiddenError`) from the apiserver. A 404 is a `NotFoundError`, which an
 * idempotent caller may want to treat as success.
 *
 * Returning without throwing means the apiserver accepted the request, not that
 * the object is gone: anything with a finalizer (every Flux resource, for one)
 * only gets its `deletionTimestamp` set here, and disappears once its controller
 * has finished cleaning up.
 */
export async function deleteResource(options: {
  kubernetesApi: KubernetesApi;
  cluster: string;
  gvk: CustomResourceMatcher;
  name: string;
  namespace?: string;
  propagationPolicy?: PropagationPolicy;
}): Promise<void> {
  const { kubernetesApi, cluster, gvk, name, namespace, propagationPolicy } =
    options;

  // As a query parameter rather than a `DeleteOptions` body: DELETE with a body
  // is the more awkward path through fetch and any proxy in between, and the two
  // are equivalent to the apiserver.
  const query = propagationPolicy
    ? `?propagationPolicy=${encodeURIComponent(propagationPolicy)}`
    : '';
  const path = `${stripTrailingSlash(
    getK8sGetPath(gvk, name, namespace),
  )}${query}`;

  const response = await kubernetesApi.proxy({
    clusterName: cluster,
    path,
    // No body, so no `Content-Type` — note that if one is ever added it must be a
    // plain object, since `KubernetesClient.getKubernetesHeaders` object-spreads
    // the headers and a `Headers` instance spreads to `{}`.
    init: {
      method: 'DELETE',
    },
  });

  if (!response.ok) {
    throw await k8sMutationError(
      response,
      `Failed to delete ${gvk.plural} ${name} on ${cluster}`,
    );
  }
}
