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

/**
 * The release blockers `AppReadinessProcessor` writes into the
 * `giantswarm.io/readiness-flags` annotation.
 *
 * Shared across the package boundary because that annotation has two authors:
 * backstage-catalog-importer merges its enforced chart-metadata gaps
 * (`META-NO-TEAM`, `NO-VALUES-SCHEMA`) into the same list. The frontend has to
 * tell the two apart to attribute each flag to the verdict it belongs to, and
 * it does so by recognising the names below — so a blocker added to the
 * processor alone would be presented as a chart-metadata gap, under a heading
 * that makes a definite and wrong claim about it.
 */
export const ReleaseReadinessFlags = {
  releaseNotPublished: 'RELEASE-NOT-PUBLISHED',
  neverPublished: 'NEVER-PUBLISHED',
} as const;

/** The flag names above, for membership tests. */
export const releaseReadinessFlagNames: string[] = Object.values(
  ReleaseReadinessFlags,
);

/**
 * The build blocker `BuildStatusProcessor` writes into the same
 * `giantswarm.io/readiness-flags` annotation.
 *
 * A third author for the list, and a third question: "does the default branch
 * build right now". It is neither a release blocker (the release that already
 * exists may well be in the registry) nor a chart-metadata gap (the chart may
 * be perfectly compliant and the build red for an unrelated reason — a revoked
 * checkout key kept resource-police unbuilt for six months). The frontend
 * recognises the name so it can say which question the flag answers.
 */
export const BuildReadinessFlags = {
  buildRed: 'BUILD-RED',
} as const;

/** The flag names above, for membership tests. */
export const buildReadinessFlagNames: string[] =
  Object.values(BuildReadinessFlags);
