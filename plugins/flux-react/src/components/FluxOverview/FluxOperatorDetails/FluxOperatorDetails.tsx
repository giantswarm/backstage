import {
  FluxInstance,
  FluxReport,
  Kustomization,
  ResourceSet,
  ResourceSetInputProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Flex, Text } from '@backstage/ui';
import { ResourceCard } from '../ResourceCard';
import { ParentSection } from '../ParentSection';
import {
  isInventoryOwner,
  KustomizationTreeBuilder,
} from '../utils/KustomizationTreeBuilder';
import { Section } from '../../UI';
import { findTargetClusterName } from '../../../utils/findTargetClusterName';
import {
  FluxResource,
  FluxResourceCollections,
  findFluxResource,
} from '../../../utils/fluxResources';
import {
  findFluxInstance,
  findFluxReport,
  findInputProviders,
  findResourceSetsUsingProvider,
} from './helpers';

const ResourceCards = ({ resources }: { resources: FluxResource[] }) => (
  <Flex direction="column" gap="6">
    {resources.map(resource => (
      <ResourceCard
        key={`${resource.cluster}-${resource.getKind()}-${resource.getNamespace()}-${resource.getName()}`}
        cluster={resource.cluster}
        kind={resource.getKind()}
        name={resource.getName()}
        namespace={resource.getNamespace()}
        targetCluster={
          resource instanceof Kustomization
            ? findTargetClusterName(resource)
            : undefined
        }
        resource={resource}
      />
    ))}
  </Flex>
);

const ThisSection = ({ resource }: { resource: FluxResource }) => (
  <Section heading={`This ${resource.getKind()}`}>
    <ResourceCard
      cluster={resource.cluster}
      kind={resource.getKind()}
      name={resource.getName()}
      namespace={resource.getNamespace()}
      resource={resource}
      highlighted
    />
  </Section>
);

type FluxOperatorDetailsProps = {
  resource: FluxInstance | ResourceSet | ResourceSetInputProvider | FluxReport;
  resources: FluxResourceCollections;
  treeBuilder?: KustomizationTreeBuilder;
};

export const FluxOperatorDetails = ({
  resource,
  resources,
  treeBuilder,
}: FluxOperatorDetailsProps) => {
  const parent =
    resource instanceof FluxReport ? null : treeBuilder?.findParent(resource);
  // A FluxInstance's sync Kustomization may apply the instance back from Git.
  // The tree shows the instance above it, so the panel does not call that
  // Kustomization its parent too.
  const isAppliedBack =
    parent &&
    isInventoryOwner(resource) &&
    treeBuilder?.findInventoryResources(resource).includes(parent);
  const parentSection = isAppliedBack ? null : (
    <ParentSection
      parent={parent}
      headingPrefix="Parent "
      allGitRepositories={resources.gitRepositories}
      allOCIRepositories={resources.ociRepositories}
    />
  );

  if (resource instanceof FluxInstance) {
    // The source and Kustomization the operator creates for spec.sync are in
    // the instance's inventory, next to the Flux controllers.
    const syncKind = resource.getSync()?.kind;
    const syncResources = syncKind
      ? (treeBuilder?.findInventoryResources(resource) ?? []).filter(
          r => r.getKind() === syncKind || r instanceof Kustomization,
        )
      : [];
    const fluxReport = findFluxReport(resource, resources.fluxReports);

    return (
      <Flex direction="column" gap="8">
        <ThisSection resource={resource} />
        {parentSection}
        {syncResources.length > 0 ? (
          <Section heading="Sync">
            <ResourceCards resources={syncResources} />
          </Section>
        ) : null}
        {fluxReport ? (
          <Section heading="FluxReport">
            <ResourceCards resources={[fluxReport]} />
          </Section>
        ) : null}
      </Flex>
    );
  }

  if (resource instanceof ResourceSet) {
    const inputProviders = findInputProviders(
      resource,
      resources.resourceSetInputProviders,
    );

    // The operator does not default a dependency's namespace: without one,
    // the dependency is a cluster-scoped object.
    const dependencies = (resource.getDependsOn() ?? []).map(dependency => {
      const namespace = dependency.namespace;
      return {
        label: `${dependency.kind} ${namespace ? `${namespace}/` : ''}${dependency.name}`,
        resource: findFluxResource(resources, {
          cluster: resource.cluster,
          kind: dependency.kind,
          name: dependency.name,
          namespace,
        }),
      };
    });
    const knownDependencies = dependencies.flatMap(d =>
      d.resource ? [d.resource] : [],
    );
    const otherDependencies = dependencies.filter(d => !d.resource);

    return (
      <Flex direction="column" gap="8">
        <ThisSection resource={resource} />
        {parentSection}
        {inputProviders.length > 0 ? (
          <Section heading="Input providers">
            <ResourceCards resources={inputProviders} />
          </Section>
        ) : null}
        {dependencies.length > 0 ? (
          <Section heading="Dependencies">
            <ResourceCards resources={knownDependencies} />
            {otherDependencies.map(d => (
              <Text key={d.label} as="p" variant="body-medium">
                {d.label}
              </Text>
            ))}
          </Section>
        ) : null}
      </Flex>
    );
  }

  if (resource instanceof ResourceSetInputProvider) {
    const resourceSets = findResourceSetsUsingProvider(
      resource,
      resources.resourceSets,
    );

    return (
      <Flex direction="column" gap="8">
        <ThisSection resource={resource} />
        {parentSection}
        {resourceSets.length > 0 ? (
          <Section heading="Used by">
            <ResourceCards resources={resourceSets} />
          </Section>
        ) : null}
      </Flex>
    );
  }

  const fluxInstance = findFluxInstance(resource, resources.fluxInstances);

  return (
    <Flex direction="column" gap="8">
      <ThisSection resource={resource} />
      {fluxInstance ? (
        <Section heading="FluxInstance">
          <ResourceCards resources={[fluxInstance]} />
        </Section>
      ) : null}
    </Flex>
  );
};
