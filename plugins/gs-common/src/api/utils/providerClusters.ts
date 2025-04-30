import * as capa from '../../model/capa';
import * as capv from '../../model/capv';
import * as capvcd from '../../model/capvcd';
import * as capz from '../../model/capz';
import { Labels } from '../constants';
import { ProviderCluster, ProviderClusterIdentity } from '../types';
import { extractIDFromARN, getApiGroupFromApiVersion } from './helpers';

export function getProviderClusterNames(kind: string) {
  let names;
  switch (kind) {
    case capa.AWSClusterKind:
      names = capa.AWSClusterNames;
      break;
    case capv.VSphereClusterKind:
      names = capv.VSphereClusterNames;
      break;
    case capvcd.VCDClusterKind:
      names = capvcd.VCDClusterNames;
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
    case capvcd.VCDClusterKind:
      gvk = capvcd.getVCDClusterGVK(apiVersion);
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

export function isVCDCluster(kind: string, apiVersion: string) {
  const apiGroup = getApiGroupFromApiVersion(apiVersion);

  return (
    kind === capvcd.VCDClusterKind && apiGroup === capvcd.VCDClusterApiGroup
  );
}

export function getProviderClusterAppVersion(providerCluster: ProviderCluster) {
  return providerCluster.metadata.labels?.[Labels.labelAppVersion];
}

export function getProviderClusterAppSourceLocation(
  providerCluster: ProviderCluster,
) {
  const { kind, apiVersion } = providerCluster;

  switch (true) {
    case isAWSCluster(kind, apiVersion):
      return 'https://github.com/giantswarm/cluster-aws';
    case isAzureCluster(kind, apiVersion):
      return 'https://github.com/giantswarm/cluster-azure';
    case isVSphereCluster(kind, apiVersion):
      return 'https://github.com/giantswarm/cluster-vsphere';
    case isVCDCluster(kind, apiVersion):
      return 'https://github.com/giantswarm/cluster-cloud-director';
    default:
      return undefined;
  }
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

  const roleARN = providerClusterIdentity.spec?.roleARN;

  return roleARN ? extractIDFromARN(roleARN) : undefined;
}

export function getProviderClusterIdentityAWSAccountUrl(
  providerClusterIdentity: ProviderClusterIdentity,
) {
  if (providerClusterIdentity.kind !== 'AWSClusterRoleIdentity') {
    return undefined;
  }

  const awsAccountId = getProviderClusterIdentityAWSAccountId(
    providerClusterIdentity,
  );

  return awsAccountId
    ? `https://${awsAccountId}.signin.aws.amazon.com/console`
    : undefined;
}

/**
 * Checks if the given provider cluster kind is supported by the plugin.
 *
 * @param kind - The provider cluster kind to check.
 * @returns `true` if the `kind` is a supported provider cluster kind, otherwise `false`.
 */
export function isSupportedProviderCluster(kind: string) {
  return [
    capa.AWSClusterKind,
    capv.VSphereClusterKind,
    capvcd.VCDClusterKind,
    capz.AzureClusterKind,
  ].includes(kind);
}

/**
 * Checks if the given provider cluster identity kind is supported by the plugin.
 *
 * For AWS clusters only the `AWSClusterRoleIdentity` kind is supported.
 * For Azure clusters only the `AzureClusterIdentity` kind is supported.
 * For vSphere clusters only the `VSphereClusterIdentity` kind is supported.
 *
 * @param kind - The cluster identity kind to check.
 * @returns `true` if the `kind` is a supported provider cluster identity kind, otherwise `false`.
 */
export function isSupportedProviderClusterIdentity(kind: string) {
  return [
    capa.AWSClusterRoleIdentityKind,
    capv.VSphereClusterIdentityKind,
    capz.AzureClusterIdentityKind,
  ].includes(kind);
}
