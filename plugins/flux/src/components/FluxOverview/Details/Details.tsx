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

type DetailsProps = {
  resourceRef: {
    cluster: string;
    namespace: string;
    name: string;
    kind: string;
  };
  resource?: Kustomization | HelmRelease;
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
  if (isLoadingResources || !treeBuilder) {
    return <Progress />;
  }

  if (!resource) {
    return (
      <Box>
        <Typography variant="body1">
          {resourceRef.kind === Kustomization.kind.toLowerCase()
            ? 'Kustomization'
            : 'HelmRelease'}{' '}
          <strong>
            {resourceRef.namespace}/{resourceRef.name}
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
    </Box>
  );
};
