import { AWSClusterKind } from '../../model/capa';
import { VSphereClusterKind } from '../../model/capv';
import { AzureClusterKind } from '../../model/capz';
import { Constants, Labels } from '../constants';
import type { Cluster } from '../types';
import { AppKind, AppNames, getAppGVK } from './apps';
import { ClusterKind, ClusterNames, getClusterGVK } from './clusters';
import {
  getKubeadmControlPlaneGVK,
  KubeadmControlPlaneKind,
  KubeadmControlPlaneNames,
} from './controlPlanes';
import {
  getGitRepositoryGVK,
  GitRepositoryKind,
  GitRepositoryNames,
} from './gitRepositories';
import {
  getHelmReleaseGVK,
  HelmReleaseKind,
  HelmReleaseNames,
} from './helmreleases';
import {
  getKustomizationGVK,
  KustomizationKind,
  KustomizationNames,
} from './kustomizations';
import {
  getProviderClusterGVK,
  getProviderClusterNames,
} from './providerClusters';

export function getResourceNames(kind: string) {
  switch (kind) {
    case AppKind:
      return AppNames;
    case AWSClusterKind:
    case AzureClusterKind:
    case VSphereClusterKind:
      return getProviderClusterNames(kind);
    case ClusterKind:
      return ClusterNames;
    case GitRepositoryKind:
      return GitRepositoryNames;
    case HelmReleaseKind:
      return HelmReleaseNames;
    case KubeadmControlPlaneKind:
      return KubeadmControlPlaneNames;
    case KustomizationKind:
      return KustomizationNames;
    default:
      throw new Error(`Unsupported resource kind: ${kind}`);
  }
}

export function getResourceGVK(kind: string, apiVersion?: string) {
  switch (kind) {
    case AppKind:
      return getAppGVK(apiVersion);
    case AWSClusterKind:
    case AzureClusterKind:
    case VSphereClusterKind:
      return getProviderClusterGVK(kind, apiVersion);
    case ClusterKind:
      return getClusterGVK(apiVersion);
    case GitRepositoryKind:
      return getGitRepositoryGVK(apiVersion);
    case HelmReleaseKind:
      return getHelmReleaseGVK(apiVersion);
    case KubeadmControlPlaneKind:
      return getKubeadmControlPlaneGVK(apiVersion);
    case KustomizationKind:
      return getKustomizationGVK(apiVersion);
    default:
      throw new Error(`Unsupported resource kind: ${kind}`);
  }
}

function getResourceAppName(resource: Cluster) {
  return resource.metadata.labels?.[Labels.labelApp];
}

/**
 * Determines whether a resource is imported.
 * @param resource
 */
export function isResourceImported(resource: Cluster) {
  return getResourceAppName(resource) === Constants.CAPI_IMPORTER_APP_NAME;
}
