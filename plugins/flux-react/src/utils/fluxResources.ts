import {
  FluxInstance,
  FluxReport,
  GitRepository,
  HelmRelease,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  OCIRepository,
  ResourceSet,
  ResourceSetInputProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Every Flux kind the UI fetches, keyed by the name of its collection. Each of
 * them has a details panel.
 */
export const FLUX_RESOURCE_CLASSES = {
  kustomizations: Kustomization,
  helmReleases: HelmRelease,
  gitRepositories: GitRepository,
  ociRepositories: OCIRepository,
  helmRepositories: HelmRepository,
  imagePolicies: ImagePolicy,
  imageRepositories: ImageRepository,
  imageUpdateAutomations: ImageUpdateAutomation,
  fluxInstances: FluxInstance,
  resourceSets: ResourceSet,
  resourceSetInputProviders: ResourceSetInputProvider,
  fluxReports: FluxReport,
} as const;

type FluxResourceClasses = typeof FLUX_RESOURCE_CLASSES;

export type FluxResourceCollectionKey = keyof FluxResourceClasses;

export type FluxResourceCollections = {
  [K in FluxResourceCollectionKey]: InstanceType<FluxResourceClasses[K]>[];
};

export type FluxResource =
  FluxResourceCollections[FluxResourceCollectionKey][number];

const COLLECTION_KEYS = Object.keys(
  FLUX_RESOURCE_CLASSES,
) as FluxResourceCollectionKey[];

export function emptyFluxResourceCollections(): FluxResourceCollections {
  return Object.fromEntries(
    COLLECTION_KEYS.map(key => [key, []]),
  ) as unknown as FluxResourceCollections;
}

export function listFluxResources(
  collections: FluxResourceCollections,
): FluxResource[] {
  return COLLECTION_KEYS.flatMap<FluxResource>(key => collections[key]);
}

export function filterFluxResourcesByCluster(
  collections: FluxResourceCollections,
  cluster: string,
): FluxResourceCollections {
  return Object.fromEntries(
    COLLECTION_KEYS.map(key => [
      key,
      (collections[key] as FluxResource[]).filter(r => r.cluster === cluster),
    ]),
  ) as unknown as FluxResourceCollections;
}

/**
 * The collection holding resources of `kind`. Matched case-insensitively,
 * because the details pane carries the kind in lower case.
 */
export function findFluxResourceCollectionKey(
  kind: string,
): FluxResourceCollectionKey | undefined {
  const lowerKind = kind.toLowerCase();

  return COLLECTION_KEYS.find(
    key => FLUX_RESOURCE_CLASSES[key].kind.toLowerCase() === lowerKind,
  );
}

export function findFluxResource(
  collections: FluxResourceCollections,
  ref: { cluster: string; kind: string; name: string; namespace?: string },
): FluxResource | undefined {
  const key = findFluxResourceCollectionKey(ref.kind);
  if (!key) {
    return undefined;
  }

  return (collections[key] as FluxResource[]).find(
    r =>
      r.cluster === ref.cluster &&
      r.getNamespace() === ref.namespace &&
      r.getName() === ref.name,
  );
}

/**
 * Whether the details panel can show resources of `kind`.
 */
export function hasDetailsPanel(kind: string): boolean {
  return findFluxResourceCollectionKey(kind) !== undefined;
}
