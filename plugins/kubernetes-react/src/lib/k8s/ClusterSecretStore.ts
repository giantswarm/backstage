import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type ClusterSecretStoreInterface =
  crds.externalSecrets.v1beta1.ClusterSecretStore;

export class ClusterSecretStore extends KubeObject<ClusterSecretStoreInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'external-secrets.io';
  static readonly kind = 'ClusterSecretStore' as const;
  static readonly plural = 'clustersecretstores';
}
