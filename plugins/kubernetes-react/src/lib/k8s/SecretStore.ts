import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type SecretStoreInterface = crds.externalSecrets.v1beta1.SecretStore;

export class SecretStore extends KubeObject<SecretStoreInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'external-secrets.io';
  static readonly kind = 'SecretStore' as const;
  static readonly plural = 'secretstores';
}
