import { Progress } from '@backstage/core-components';
import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Typography } from '@material-ui/core';
import { KustomizationDetails } from '../KustomizationDetails';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { HelmReleaseDetails } from '../HelmReleaseDetails';
import { RepositoryDetails } from '../RepositoryDetails';

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
    | HelmRepository;
  allKustomizations: Kustomization[];
  allHelmReleases: HelmRelease[];
  allGitRepositories: GitRepository[];
  allOCIRepositories: OCIRepository[];
  allHelmRepositories: HelmRepository[];
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
    </Box>
  );
};
