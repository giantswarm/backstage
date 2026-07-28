import { KubernetesApi } from '@backstage/plugin-kubernetes-react';

const SELF_SUBJECT_ACCESS_REVIEW_PATH =
  '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews';

/**
 * The subset of `authorization.k8s.io/v1` `ResourceAttributes` we need.
 *
 * `version` is deliberately omitted: RBAC rules are version-independent, so
 * pinning a version only risks a mismatch.
 */
export type ResourceAttributes = {
  /** API group. Empty string (or omitted) for core resources. */
  group?: string;
  /** Plural resource name, e.g. `kustomizations`. */
  resource: string;
  namespace?: string;
  /**
   * Optional resource name. Omitting it asks whether the verb is allowed on
   * *any* resource of this type in the namespace, which does not match RBAC
   * rules that restrict access via `resourceNames`.
   */
  name?: string;
  subresource?: string;
  verb: string;
};

/**
 * Asks the target cluster whether the signed-in user may perform `verb` on the
 * given resource, via a `SelfSubjectAccessReview`.
 *
 * The review itself is available to every authenticated user — the built-in
 * `system:basic-user` ClusterRole grants `create` on
 * `selfsubjectaccessreviews` — so this works for read-only users too.
 */
export async function createSelfSubjectAccessReview(options: {
  kubernetesApi: KubernetesApi;
  cluster: string;
  resourceAttributes: ResourceAttributes;
}): Promise<boolean> {
  const { kubernetesApi, cluster, resourceAttributes } = options;

  const response = await kubernetesApi.proxy({
    clusterName: cluster,
    path: SELF_SUBJECT_ACCESS_REVIEW_PATH,
    init: {
      method: 'POST',
      // Plain object, not a `Headers` instance — see `patchResource`.
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SelfSubjectAccessReview',
        spec: { resourceAttributes },
      }),
    },
  });

  if (!response.ok) {
    const error = new Error(
      `Failed to review access to ${resourceAttributes.resource} on ${cluster}. Reason: ${response.statusText}.`,
    );
    error.name = response.status === 403 ? 'ForbiddenError' : error.name;

    throw error;
  }

  const review = await response.json();

  return Boolean(review?.status?.allowed);
}
