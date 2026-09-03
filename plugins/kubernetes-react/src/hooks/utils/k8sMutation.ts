/**
 * Shared plumbing for mutating verbs against the Kubernetes proxy.
 *
 * Reads tolerate things a write should not, so the handful of details that make a
 * proxied mutation behave live here rather than being rediscovered per verb.
 */

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
export function stripTrailingSlash(path: string): string {
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
 * An `Error` for a failed mutation, named so callers can branch on the
 * outcomes that mean something other than "it broke": `ForbiddenError` (the
 * user's RBAC says no), `NotFoundError` (nothing there to act on, which an
 * idempotent caller may treat as success) and `ConflictError` (for a create,
 * the name is already taken).
 */
export async function k8sMutationError(
  response: Response,
  description: string,
): Promise<Error> {
  const message = await readErrorMessage(response);
  const error = new Error(`${description}. Reason: ${message}.`);

  if (response.status === 403) {
    error.name = 'ForbiddenError';
  } else if (response.status === 404) {
    error.name = 'NotFoundError';
  } else if (response.status === 409) {
    error.name = 'ConflictError';
  }

  return error;
}
