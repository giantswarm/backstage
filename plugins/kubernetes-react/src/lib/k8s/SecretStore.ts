import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type SecretStoreInterface = crds.externalSecrets.v1beta1.SecretStore;

export class SecretStore extends KubeObject<SecretStoreInterface> {
  static apiVersion = 'v1beta1';
  static group = 'external-secrets.io';
  static kind = 'SecretStore' as const;
  static plural = 'secretstores';
}
