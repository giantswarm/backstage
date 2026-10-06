import { dump } from 'js-yaml';
import type { KubeObjectInterface } from './KubeObject';

const LAST_APPLIED_ANNOTATION =
  'kubectl.kubernetes.io/last-applied-configuration';

/**
 * The object as the YAML a reader would compare against `kubectl get -o yaml`.
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
export function toManifestYaml(object: {
  jsonData: KubeObjectInterface;
}): string {
  const { apiVersion, kind, metadata, ...rest } = object.jsonData;
  const {
    managedFields: _managedFields,
    annotations,
    ...restMetadata
  } = metadata ?? {};

  const { [LAST_APPLIED_ANNOTATION]: _lastApplied, ...restAnnotations } =
    annotations ?? {};

  return dump(
    // Object spread order decides the key order, so this prints `apiVersion,
    // kind, metadata, spec, status` like `kubectl get -o yaml`. `sortKeys` is
    // off deliberately: alphabetical would put `status` before `spec`.
    {
      apiVersion,
      kind,
      metadata: {
        ...restMetadata,
        ...(Object.keys(restAnnotations).length > 0
          ? { annotations: restAnnotations }
          : {}),
      },
      ...rest,
    },
    // Long values such as controller messages are a reason to open this, so
    // don't let js-yaml fold them at 80 columns.
    { lineWidth: -1, noRefs: true, sortKeys: false },
  );
}
