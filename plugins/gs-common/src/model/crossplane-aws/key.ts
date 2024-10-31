import * as v1beta1 from './v1beta1';

export const ProviderConfigKind = 'ProviderConfig';
export const ProviderConfigApiGroup = 'aws.upbound.io';
export const ProviderConfigNames = {
  plural: 'providerconfigs',
  singular: 'providerconfig',
};

export function getProviderConfigGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.ProviderConfigGVK;
  }

  switch (apiVersion) {
    case v1beta1.ProviderConfigApiVersion:
      return v1beta1.ProviderConfigGVK;
    default:
      return undefined;
  }
}
