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
  allImageRepositories: ImageRepository[];
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
  allImageRepositories,
  treeBuilder,
  isLoadingResources,
}: DetailsProps) => {
  if (isLoadingResources) {
    return <Progress />;
  }

  if (!resource) {
    // Determine the resource kind name for display
    let resourceKindName = resourceRef.kind;
    if (resourceRef.kind === Kustomization.kind.toLowerCase()) {
      resourceKindName = 'Kustomization';
    } else if (resourceRef.kind === HelmRelease.kind.toLowerCase()) {
      resourceKindName = 'HelmRelease';
    } else if (resourceRef.kind === GitRepository.kind.toLowerCase()) {
      resourceKindName = 'GitRepository';
    } else if (resourceRef.kind === OCIRepository.kind.toLowerCase()) {
      resourceKindName = 'OCIRepository';
    } else if (resourceRef.kind === HelmRepository.kind.toLowerCase()) {
      resourceKindName = 'HelmRepository';
    } else if (resourceRef.kind === ImagePolicy.kind.toLowerCase()) {
      resourceKindName = 'ImagePolicy';
    } else if (resourceRef.kind === ImageRepository.kind.toLowerCase()) {
      resourceKindName = 'ImageRepository';
    } else if (resourceRef.kind === ImageUpdateAutomation.kind.toLowerCase()) {
      resourceKindName = 'ImageUpdateAutomation';
    }

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
          allImageRepositories={allImageRepositories}
          treeBuilder={treeBuilder}
        />
      )}
    </Box>
  );
};
