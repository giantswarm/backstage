import { Constants, Labels } from '@giantswarm/backstage-plugin-gs-common';
import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ClusterTypes } from '../../clusters/utils';

// App CR utils

function isAppTargetClusterManagementCluster(app: App) {
  const kubeConfig = app.getKubeConfig();

  if (!kubeConfig) {
    return false;
  }

  return (
    kubeConfig.inCluster === true ||
    kubeConfig.secret?.name === `${app.cluster}-kubeconfig`
  );
}

function getAppTargetClusterName(app: App) {
  if (isAppTargetClusterManagementCluster(app)) {
    return app.cluster;
  }

  return app.findLabel(Labels.labelCluster);
}

function getAppTargetClusterNamespace(app: App) {
  if (isAppTargetClusterManagementCluster(app)) {
    return Constants.MANAGEMENT_CLUSTER_NAMESPACE;
  }

  return app.getNamespace();
}

// HelmRelease utils

function isHelmReleaseTargetClusterManagementCluster(helmRelease: HelmRelease) {
  const kubeConfig = helmRelease.getKubeConfig();

  return !Boolean(kubeConfig);
}

function getHelmReleaseTargetClusterName(helmRelease: HelmRelease) {
  if (isHelmReleaseTargetClusterManagementCluster(helmRelease)) {
    return helmRelease.cluster;
  }

  return helmRelease.findLabel(Labels.labelCluster);
}

function getHelmReleaseTargetClusterNamespace(helmRelease: HelmRelease) {
  if (isHelmReleaseTargetClusterManagementCluster(helmRelease)) {
    return Constants.MANAGEMENT_CLUSTER_NAMESPACE;
  }

  return helmRelease.getNamespace();
}

export function findTargetClusterName(deployment: App | HelmRelease) {
  if (deployment instanceof App) {
    return getAppTargetClusterName(deployment);
  }

  if (deployment instanceof HelmRelease) {
    return getHelmReleaseTargetClusterName(deployment);
  }

  return undefined;
}

export function findTargetClusterNamespace(deployment: App | HelmRelease) {
  if (deployment instanceof App) {
    return getAppTargetClusterNamespace(deployment);
  }

  if (deployment instanceof HelmRelease) {
    return getHelmReleaseTargetClusterNamespace(deployment);
  }

  return undefined;
}

export function findTargetClusterType(deployment: App | HelmRelease) {
  if (deployment instanceof App) {
    return isAppTargetClusterManagementCluster(deployment)
      ? ClusterTypes.Management
      : ClusterTypes.Workload;
  }

  if (deployment instanceof HelmRelease) {
    return isHelmReleaseTargetClusterManagementCluster(deployment)
      ? ClusterTypes.Management
      : ClusterTypes.Workload;
  }

  return undefined;
}
