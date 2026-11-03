import { dump } from 'js-yaml';
import type { KubeObjectInterface } from './KubeObject';

const LAST_APPLIED_ANNOTATION =
  'kubectl.kubernetes.io/last-applied-configuration';

/**
 * The object as `kubectl get -o yaml` prints it: every key sorted
 * alphabetically, at every level.
 *
 * Two fields are dropped first:
 *
 * - `metadata.managedFields`, which is server-side-apply bookkeeping and, on a
 *   reconciled object, often the bulk of it. It pushes the spec off the screen,
 *   and `kubectl get` hides it too.
 * - the `last-applied-configuration` annotation, which is a JSON copy of the
 *   whole object on one line — the same information, rendered unreadably.
 *
 * Everything else is shown verbatim, `status` included.
 */
export function toKubectlYaml(object: {
  jsonData: KubeObjectInterface;
}): string {
  const { metadata } = object.jsonData;
  const {
    managedFields: _managedFields,
    annotations,
    ...restMetadata
  } = metadata ?? {};

  const { [LAST_APPLIED_ANNOTATION]: _lastApplied, ...restAnnotations } =
    annotations ?? {};

  return dump(
    {
      ...object.jsonData,
      metadata: {
        ...restMetadata,
        ...(Object.keys(restAnnotations).length > 0
          ? { annotations: restAnnotations }
          : {}),
      },
    },
    // Long values such as controller messages are a reason to open this, so
    // don't let js-yaml fold them at 80 columns.
    { lineWidth: -1, noRefs: true, sortKeys: true },
  );
}
