import {
  FluxInstance,
  FluxReport,
  InputProviderRef,
  matchesLabelSelector,
  ResourceSet,
  ResourceSetInputProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';

function matchesInputProviderRef(
  provider: ResourceSetInputProvider,
  ref: InputProviderRef,
): boolean {
  if (provider.getNamespace() !== ref.namespace) {
    return false;
  }

  if ('name' in ref) {
    return provider.getName() === ref.name;
  }

  return matchesLabelSelector(ref.selector, provider.getLabels());
}

/**
 * The input providers a ResourceSet reads from, in its cluster.
 */
export function findInputProviders(
  resourceSet: ResourceSet,
  allInputProviders: ResourceSetInputProvider[],
): ResourceSetInputProvider[] {
  const refs = resourceSet.getInputProviderRefs();

  return allInputProviders.filter(
    provider =>
      provider.cluster === resourceSet.cluster &&
      refs.some(ref => matchesInputProviderRef(provider, ref)),
  );
}

/**
 * The ResourceSets that read inputs from a provider, in its cluster.
 */
export function findResourceSetsUsingProvider(
  provider: ResourceSetInputProvider,
  allResourceSets: ResourceSet[],
): ResourceSet[] {
  return allResourceSets.filter(
    resourceSet =>
      resourceSet.cluster === provider.cluster &&
      resourceSet
        .getInputProviderRefs()
        .some(ref => matchesInputProviderRef(provider, ref)),
  );
}

/**
 * The FluxReport the operator keeps next to a FluxInstance, in the operator's
 * namespace.
 */
export function findFluxReport(
  fluxInstance: FluxInstance,
  allFluxReports: FluxReport[],
): FluxReport | undefined {
  return allFluxReports.find(
    report =>
      report.cluster === fluxInstance.cluster &&
      report.getNamespace() === fluxInstance.getNamespace(),
  );
}

/**
 * The FluxInstance a FluxReport reports on, if Flux is managed by the operator.
 */
export function findFluxInstance(
  fluxReport: FluxReport,
  allFluxInstances: FluxInstance[],
): FluxInstance | undefined {
  return allFluxInstances.find(
    instance =>
      instance.cluster === fluxReport.cluster &&
      instance.getNamespace() === fluxReport.getNamespace(),
  );
}
