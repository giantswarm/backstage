import * as capa from '../../model/capa';
import * as capv from '../../model/capv';
import * as capz from '../../model/capz';
import { ProviderCluster, ProviderClusterIdentity } from '../types';
import { getApiGroupFromApiVersion } from './helpers';

export function getProviderClusterNames(kind: string) {
  let names;
  switch (kind) {
    case capa.AWSClusterKind:
      names = capa.AWSClusterNames;
      break;
    case capv.VSphereClusterKind:
      names = capv.VSphereClusterNames;
      break;
    case capz.AzureClusterKind:
      names = capz.AzureClusterNames;
      break;
    default:
      throw new Error(`${kind} is not a supported provider cluster kind.`);
  }

  return names;
}

export function getProviderClusterGVK(kind: string, apiVersion?: string) {
  let gvk;
  switch (kind) {
    case capa.AWSClusterKind:
      gvk = capa.getAWSClusterGVK(apiVersion);
      break;
    case capv.VSphereClusterKind:
      gvk = capv.getVSphereClusterGVK(apiVersion);
      break;
    case capz.AzureClusterKind:
      gvk = capz.getAzureClusterGVK(apiVersion);
      break;
    default:
      throw new Error(`${kind} is not a supported provider cluster kind.`);
  }

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function getProviderClusterIdentityGVK(
  kind: string,
  apiVersion?: string,
) {
  let gvk;
  switch (kind) {
    case capa.AWSClusterRoleIdentityKind:
      gvk = capa.getAWSClusterRoleIdentityGVK(apiVersion);
      break;
    case capv.VSphereClusterIdentityKind:
      gvk = capv.getVSphereClusterIdentityGVK(apiVersion);
      break;
    case capz.AzureClusterIdentityKind:
      gvk = capz.getAzureClusterIdentityGVK(apiVersion);
      break;
    default:
      throw new Error(
        `${kind} is not a supported provider cluster identity kind.`,
      );
  }

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function isAWSCluster(kind: string, apiVersion: string) {
  const apiGroup = getApiGroupFromApiVersion(apiVersion);

  return kind === capa.AWSClusterKind && apiGroup === capa.AWSClusterApiGroup;
}

export function isAzureCluster(kind: string, apiVersion: string) {
  const apiGroup = getApiGroupFromApiVersion(apiVersion);

  return (
    kind === capz.AzureClusterKind && apiGroup === capz.AzureClusterApiGroup
  );
}

export function isVSphereCluster(kind: string, apiVersion: string) {
  const apiGroup = getApiGroupFromApiVersion(apiVersion);

  return (
    kind === capv.VSphereClusterKind && apiGroup === capv.VSphereClusterApiGroup
  );
}

export function getProviderClusterLocation(providerCluster: ProviderCluster) {
  if (typeof providerCluster === 'undefined') {
    return undefined;
  }

  const { kind, apiVersion } = providerCluster;
  const apiGroup = getApiGroupFromApiVersion(apiVersion);

  switch (true) {
    case kind === capa.AWSClusterKind && apiGroup === capa.AWSClusterApiGroup:
      return providerCluster.spec?.region;
    case kind === capz.AzureClusterKind &&
      apiGroup === capz.AzureClusterApiGroup:
      return providerCluster.spec?.location;
    default:
      return undefined;
  }
}

export function getProviderClusterIdentityRef(
  providerCluster: ProviderCluster,
) {
  const identityRef = providerCluster?.spec?.identityRef;
  if (!identityRef) {
    return undefined;
  }

  const { kind, name } = identityRef;

  if (!kind || !name) {
    throw new Error('Kind or name is missing in infrastructure reference.');
  }

  let apiVersion;
  let namespace;
  if (identityRef.kind === 'AzureClusterIdentity') {
    apiVersion = identityRef.apiVersion;
    namespace = identityRef.namespace;
  }

  return {
    apiVersion,
    kind,
    name,
    namespace,
  };
}

export function getProviderClusterIdentityAWSAccountId(
  providerClusterIdentity: ProviderClusterIdentity,
) {
  if (providerClusterIdentity.kind !== 'AWSClusterRoleIdentity') {
    return undefined;
  }

  return providerClusterIdentity.spec?.roleARN;
}
