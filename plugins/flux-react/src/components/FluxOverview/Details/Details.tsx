import { Progress } from '@backstage/core-components';
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
import {
  FLUX_RESOURCE_CLASSES,
  FluxResource,
  FluxResourceCollections,
  findFluxResourceCollectionKey,
} from '../../../utils/fluxResources';
import { Box, Flex, Text } from '@backstage/ui';
import { KustomizationDetails } from '../KustomizationDetails';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { HelmReleaseDetails } from '../HelmReleaseDetails';
import { RepositoryDetails } from '../RepositoryDetails';
import { ImageAutomationDetails } from '../ImageAutomationDetails';
import { FluxOperatorDetails } from '../FluxOperatorDetails';
import { ResourceManifestDialogProvider } from '../ResourceManifestDialogProvider';

type DetailsProps = {
  resourceRef: {
    cluster: string;
    kind: string;
    name: string;
    namespace?: string;
  };
  resource?: FluxResource;
  resources: FluxResourceCollections;
  treeBuilder?: KustomizationTreeBuilder;
  isLoadingResources: boolean;
};

const DetailsContent = ({
  resourceRef,
  resource,
  resources,
  treeBuilder,
  isLoadingResources,
}: DetailsProps) => {
  if (isLoadingResources) {
    return <Progress />;
  }

  if (!resource) {
    // Determine the resource kind name and count of available resources for display
    let resourceKindName = resourceRef.kind;
    let resourcesInCluster = 0;

    const collectionKey = findFluxResourceCollectionKey(resourceRef.kind);
    if (collectionKey) {
      resourceKindName = FLUX_RESOURCE_CLASSES[collectionKey].kind;
      resourcesInCluster = (resources[collectionKey] as FluxResource[]).filter(
        r => r.cluster === resourceRef.cluster,
      ).length;
    }

    // Generate a diagnostic message based on whether any resources of this type exist
    const diagnosticMessage =
      resourcesInCluster === 0
        ? `No ${resourceKindName} resources were found in cluster ${resourceRef.cluster}. This could indicate a permissions issue or that this resource type is not available.`
        : `This resource is referenced in an inventory but could not be found. It may have been deleted or the inventory data may be stale.`;

    return (
      <Flex direction="column" gap="2">
        <Text as="p" variant="body-medium">
          {resourceKindName}{' '}
          <strong>
            {resourceRef.namespace ? `${resourceRef.namespace}/` : ''}
            {resourceRef.name}
          </strong>{' '}
          in cluster <strong>{resourceRef.cluster}</strong> not found.
        </Text>
        <Text as="p" variant="body-small" color="secondary">
          {diagnosticMessage}
        </Text>
      </Flex>
    );
  }

  return (
    <Box>
      {resource.getKind() === Kustomization.kind && (
        <KustomizationDetails
          kustomization={resource as Kustomization}
          allKustomizations={resources.kustomizations}
          allGitRepositories={resources.gitRepositories}
          allOCIRepositories={resources.ociRepositories}
          treeBuilder={treeBuilder}
        />
      )}
      {resource.getKind() === HelmRelease.kind && (
        <HelmReleaseDetails
          helmRelease={resource as HelmRelease}
          allHelmReleases={resources.helmReleases}
          allGitRepositories={resources.gitRepositories}
          allOCIRepositories={resources.ociRepositories}
          allHelmRepositories={resources.helmRepositories}
          treeBuilder={treeBuilder}
        />
      )}
      {(resource.getKind() === GitRepository.kind ||
        resource.getKind() === OCIRepository.kind ||
        resource.getKind() === HelmRepository.kind) && (
        <RepositoryDetails
          repository={
            resource as GitRepository | OCIRepository | HelmRepository
          }
          allKustomizations={resources.kustomizations}
          allHelmReleases={resources.helmReleases}
        />
      )}
      {(resource.getKind() === ImagePolicy.kind ||
        resource.getKind() === ImageRepository.kind ||
        resource.getKind() === ImageUpdateAutomation.kind) && (
        <ImageAutomationDetails
          resource={
            resource as ImagePolicy | ImageRepository | ImageUpdateAutomation
          }
          allImagePolicies={resources.imagePolicies}
          allImageRepositories={resources.imageRepositories}
          allGitRepositories={resources.gitRepositories}
          allOCIRepositories={resources.ociRepositories}
          treeBuilder={treeBuilder}
        />
      )}
      {(resource instanceof FluxInstance ||
        resource instanceof ResourceSet ||
        resource instanceof ResourceSetInputProvider ||
        resource instanceof FluxReport) && (
        <FluxOperatorDetails
          resource={resource}
          resources={resources}
          treeBuilder={treeBuilder}
        />
      )}
    </Box>
  );
};

/**
 * The manifest dialog's provider wraps every state of the panel, so an open
 * dialog stays open when its resource is selected away or disappears.
 */
export const Details = (props: DetailsProps) => (
  <ResourceManifestDialogProvider>
    <DetailsContent {...props} />
  </ResourceManifestDialogProvider>
);
