import * as awsv1beta1 from '../../model/awsv1beta1';
import type { ProviderConfig } from '../types';

export const providerConfigGVK = [awsv1beta1.providerConfigGVK];

export function getProviderConfigName(providerConfig: ProviderConfig) {
  return providerConfig.metadata.name;
}
