import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type ProviderConfigInterface = crds.crossplane.v1beta1.ProviderConfig;

export class ProviderConfig extends KubeObject<ProviderConfigInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'aws.upbound.io';
  static readonly kind = 'ProviderConfig' as const;
  static readonly plural = 'providerconfigs';
}
