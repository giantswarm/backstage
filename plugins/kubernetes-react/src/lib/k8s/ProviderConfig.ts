import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type ProviderConfigInterface = crds.crossplane.v1beta1.ProviderConfig;

export class ProviderConfig extends KubeObject<ProviderConfigInterface> {
  static apiVersion = 'v1beta1';
  static group = 'aws.upbound.io';
  static kind = 'ProviderConfig' as const;
  static plural = 'providerconfigs';
}
