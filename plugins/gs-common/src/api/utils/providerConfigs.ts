import * as crossplaneAWS from '../../model/crossplane-aws';

import type { ProviderConfig } from '../types';

export function getProviderConfigGVK(provider: string, apiVersion?: string) {
  let gvk;
  let kind;
  switch (provider) {
    case 'aws':
      gvk = crossplaneAWS.getProviderConfigGVK(apiVersion);
      kind = crossplaneAWS.ProviderConfigKind;
      break;
    default:
      throw new Error(`${provider} is not a supported provider.`);
  }

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function getProviderConfigName(providerConfig: ProviderConfig) {
  return providerConfig.metadata.name;
}
