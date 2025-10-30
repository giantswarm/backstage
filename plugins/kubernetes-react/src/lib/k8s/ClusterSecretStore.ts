import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type ClusterSecretStoreInterface =
  crds.externalSecrets.v1beta1.ClusterSecretStore;

export class ClusterSecretStore extends KubeObject<ClusterSecretStoreInterface> {
  static apiVersion = 'v1beta1';
  static group = 'external-secrets.io';
  static kind = 'ClusterSecretStore' as const;
  static plural = 'clustersecretstores';
}
