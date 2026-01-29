import { KubeObject, KubeObjectInterface } from '../KubeObject';

export class ProviderCluster<
  T extends KubeObjectInterface = any,
> extends KubeObject<T> {
  getLocation(): string | undefined {
    return undefined;
  }

  getIdentityRef():
    | {
        apiVersion?: string;
        apiGroup?: string;
        kind: string;
        name: string;
        namespace: string;
      }
    | undefined {
    const ref = this.jsonData.spec?.identityRef;
    if (!ref) {
      return undefined;
    }
    // Include apiGroup if present (for TypedLocalObjectReference format)
    const refNamespace = 'namespace' in ref ? ref.namespace : undefined;
    return {
      apiVersion: 'apiVersion' in ref ? ref.apiVersion : undefined,
      apiGroup:
        'apiGroup' in ref ? (ref as { apiGroup?: string }).apiGroup : undefined,
      kind: ref.kind,
      name: ref.name,
      namespace: refNamespace ?? this.getNamespace() ?? '',
    };
  }
}
