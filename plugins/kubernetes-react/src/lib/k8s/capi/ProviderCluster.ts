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
        kind: string;
        name: string;
        namespace?: string;
      }
    | undefined {
    return this.jsonData.spec?.identityRef;
  }
}
