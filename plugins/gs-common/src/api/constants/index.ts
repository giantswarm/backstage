export const Annotations = {
  annotationClusterDescription: 'cluster.giantswarm.io/description',
  annotationImportedClusterCreationTimestamp:
    'giantswarm.io/external-cluster-created',
} as const;

export const Labels = {
  // CAPI labels
  labelClusterName: 'cluster.x-k8s.io/cluster-name',
  labelMachineControlPlane: 'cluster.x-k8s.io/control-plane',
  labelRole: 'cluster.x-k8s.io/role',

  // Giant Swarm labels
  labelCluster: 'giantswarm.io/cluster',
  labelMachinePool: 'giantswarm.io/machine-pool',
  labelOrganization: 'giantswarm.io/organization',
  labelServicePriority: 'giantswarm.io/service-priority',
  labelReleaseVersion: 'release.giantswarm.io/version',

  // Cluster app labels
  labelApp: 'app',
  labelAppVersion: 'app.kubernetes.io/version',
} as const;

export const ClusterConditionTypes = {
  controlPlaneInitialized: 'ControlPlaneInitialized',
} as const;

export const Constants = {
  // Common prefix used for cluster app names
  CLUSTER_APP_NAME_PREFIX: 'cluster-',

  // Namespace we expect the management cluster to be in.
  MANAGEMENT_CLUSTER_NAMESPACE: 'org-giantswarm',

  // App name for imported resources
  CAPI_IMPORTER_APP_NAME: 'crossplane-capi-import',
} as const;
