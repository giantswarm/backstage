import { Progress } from '@backstage/core-components';
import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Typography } from '@material-ui/core';
import { KustomizationDetails } from '../KustomizationDetails';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { HelmReleaseDetails } from '../HelmReleaseDetails';
import { RepositoryDetails } from '../RepositoryDetails';
import { ImageAutomationDetails } from '../ImageAutomationDetails';

type DetailsProps = {
  resourceRef: {
    cluster: string;
    kind: string;
    name: string;
    namespace?: string;
  };
  resource?:
    | Kustomization
    | HelmRelease
    | GitRepository
    | OCIRepository
    | HelmRepository
    | ImagePolicy
    | ImageRepository
    | ImageUpdateAutomation;
  allKustomizations: Kustomization[];
  allHelmReleases: HelmRelease[];
  allGitRepositories: GitRepository[];
  allOCIRepositories: OCIRepository[];
  allHelmRepositories: HelmRepository[];
  allImagePolicies: ImagePolicy[];
  allImageRepositories: ImageRepository[];
  allImageUpdateAutomations: ImageUpdateAutomation[];
  treeBuilder?: KustomizationTreeBuilder;
  isLoadingResources: boolean;
};

export const Details = ({
  resourceRef,
  resource,
  allKustomizations,
  allHelmReleases,
  allGitRepositories,
  allOCIRepositories,
  allHelmRepositories,
  allImagePolicies,
  allImageRepositories,
  allImageUpdateAutomations,
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

    if (resourceRef.kind === Kustomization.kind.toLowerCase()) {
      resourceKindName = 'Kustomization';
      resourcesInCluster = allKustomizations.filter(
        r => r.cluster === resourceRef.cluster,
      ).length;
    } else if (resourceRef.kind === HelmRelease.kind.toLowerCase()) {
      resourceKindName = 'HelmRelease';
      resourcesInCluster = allHelmReleases.filter(
        r => r.cluster === resourceRef.cluster,
      ).length;
    } else if (resourceRef.kind === GitRepository.kind.toLowerCase()) {
      resourceKindName = 'GitRepository';
      resourcesInCluster = allGitRepositories.filter(
        r => r.cluster === resourceRef.cluster,
      ).length;
    } else if (resourceRef.kind === OCIRepository.kind.toLowerCase()) {
      resourceKindName = 'OCIRepository';
      resourcesInCluster = allOCIRepositories.filter(
        r => r.cluster === resourceRef.cluster,
      ).length;
    } else if (resourceRef.kind === HelmRepository.kind.toLowerCase()) {
      resourceKindName = 'HelmRepository';
      resourcesInCluster = allHelmRepositories.filter(
        r => r.cluster === resourceRef.cluster,
      ).length;
    } else if (resourceRef.kind === ImagePolicy.kind.toLowerCase()) {
      resourceKindName = 'ImagePolicy';
      resourcesInCluster = allImagePolicies.filter(
        r => r.cluster === resourceRef.cluster,
      ).length;
    } else if (resourceRef.kind === ImageRepository.kind.toLowerCase()) {
      resourceKindName = 'ImageRepository';
      resourcesInCluster = allImageRepositories.filter(
        r => r.cluster === resourceRef.cluster,
      ).length;
    } else if (resourceRef.kind === ImageUpdateAutomation.kind.toLowerCase()) {
      resourceKindName = 'ImageUpdateAutomation';
      resourcesInCluster = allImageUpdateAutomations.filter(
        r => r.cluster === resourceRef.cluster,
      ).length;
    }

    // Generate a diagnostic message based on whether any resources of this type exist
    const diagnosticMessage =
      resourcesInCluster === 0
        ? `No ${resourceKindName} resources were found in cluster ${resourceRef.cluster}. This could indicate a permissions issue or that this resource type is not available.`
        : `This resource is referenced in a Kustomization inventory but could not be found. It may have been deleted or the inventory data may be stale.`;

    return (
      <Box>
        <Typography variant="body1">
          {resourceKindName}{' '}
          <strong>
            {resourceRef.namespace ? `${resourceRef.namespace}/` : ''}
            {resourceRef.name}
          </strong>{' '}
          in cluster <strong>{resourceRef.cluster}</strong> not found.
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {diagnosticMessage}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {resource.getKind() === Kustomization.kind && (
        <KustomizationDetails
          kustomization={resource as Kustomization}
          allKustomizations={allKustomizations}
          allGitRepositories={allGitRepositories}
          allOCIRepositories={allOCIRepositories}
          treeBuilder={treeBuilder}
        />
      )}
      {resource.getKind() === HelmRelease.kind && (
        <HelmReleaseDetails
          helmRelease={resource as HelmRelease}
          allHelmReleases={allHelmReleases}
          allGitRepositories={allGitRepositories}
          allOCIRepositories={allOCIRepositories}
          allHelmRepositories={allHelmRepositories}
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
          allKustomizations={allKustomizations}
          allHelmReleases={allHelmReleases}
        />
      )}
      {(resource.getKind() === ImagePolicy.kind ||
        resource.getKind() === ImageRepository.kind ||
        resource.getKind() === ImageUpdateAutomation.kind) && (
        <ImageAutomationDetails
          resource={
            resource as ImagePolicy | ImageRepository | ImageUpdateAutomation
          }
          allImagePolicies={allImagePolicies}
          allImageRepositories={allImageRepositories}
          allGitRepositories={allGitRepositories}
          treeBuilder={treeBuilder}
        />
      )}
    </Box>
  );
};
