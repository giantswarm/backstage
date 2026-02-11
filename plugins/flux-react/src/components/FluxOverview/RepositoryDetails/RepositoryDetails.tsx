import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';
import { ResourceCard } from '../ResourceCard';
import { Section } from '../../UI';
import { findTargetClusterName } from '../../../utils/findTargetClusterName';

function findResourcesUsingSource(
  repository: GitRepository | OCIRepository | HelmRepository,
  allKustomizations: Kustomization[],
  allHelmReleases: HelmRelease[],
): Array<Kustomization | HelmRelease> {
  const resourcesMap = new Map<string, Kustomization | HelmRelease>();
  const repoName = repository.getName();
  const repoNamespace = repository.getNamespace();
  const repoKind = repository.getKind();
  const repoCluster = repository.cluster;

  // Helper function to create a unique key for a resource
  const getResourceKey = (resource: Kustomization | HelmRelease): string => {
    return `${resource.cluster}-${resource.getKind()}-${resource.getNamespace()}-${resource.getName()}`;
  };

  // Find Kustomizations using this source (in the same cluster)
  for (const kustomization of allKustomizations) {
    // Only include resources from the same cluster
    if (kustomization.cluster !== repoCluster) {
      continue;
    }

    const sourceRef = kustomization.getSourceRef();
    if (sourceRef) {
      const sourceNamespace =
        sourceRef.namespace ?? kustomization.getNamespace();
      if (
        sourceRef.name === repoName &&
        sourceNamespace === repoNamespace &&
        sourceRef.kind === repoKind
      ) {
        const key = getResourceKey(kustomization);
        resourcesMap.set(key, kustomization);
      }
    }
  }

  // Find HelmReleases using this source (in the same cluster)
  for (const helmRelease of allHelmReleases) {
    // Only include resources from the same cluster
    if (helmRelease.cluster !== repoCluster) {
      continue;
    }

    const chart = helmRelease.getChart();
    const chartRef = helmRelease.getChartRef();

    let matches = false;

    // Check chartRef for OCIRepository
    if (!chart && chartRef) {
      if (chartRef.kind === repoKind) {
        const sourceNamespace =
          chartRef.namespace ?? helmRelease.getNamespace();
        if (chartRef.name === repoName && sourceNamespace === repoNamespace) {
          matches = true;
        }
      }
    }

    // Check chart.spec.sourceRef for GitRepository and HelmRepository
    if (chart && chart.spec && chart.spec.sourceRef) {
      const sourceNamespace =
        chart.spec.sourceRef.namespace ?? helmRelease.getNamespace();
      if (
        chart.spec.sourceRef.name === repoName &&
        sourceNamespace === repoNamespace &&
        chart.spec.sourceRef.kind === repoKind
      ) {
        matches = true;
      }
    }

    if (matches) {
      const key = getResourceKey(helmRelease);
      resourcesMap.set(key, helmRelease);
    }
  }

  return Array.from(resourcesMap.values());
}

type RepositoryDetailsProps = {
  repository: GitRepository | OCIRepository | HelmRepository;
  allKustomizations: Kustomization[];
  allHelmReleases: HelmRelease[];
};

export const RepositoryDetails = ({
  repository,
  allKustomizations,
  allHelmReleases,
}: RepositoryDetailsProps) => {
  const dependentResources = findResourcesUsingSource(
    repository,
    allKustomizations,
    allHelmReleases,
  );

  return (
    <Box>
      <Section heading={`This ${repository.getKind()}`}>
        <ResourceCard
          cluster={repository.cluster}
          kind={repository.getKind()}
          name={repository.getName()}
          namespace={repository.getNamespace()}
          resource={repository}
          highlighted
        />
      </Section>

      {dependentResources.length > 0 ? (
        <Section heading="Resources using this source">
          <Grid container spacing={3}>
            {dependentResources.map(resource => (
              <Grid
                item
                xs={12}
                key={`${resource.cluster}-${resource.getKind()}-${resource.getNamespace()}-${resource.getName()}`}
              >
                <ResourceCard
                  cluster={resource.cluster}
                  kind={resource.getKind()}
                  name={resource.getName()}
                  namespace={resource.getNamespace()}
                  targetCluster={
                    resource instanceof Kustomization ||
                    resource instanceof HelmRelease
                      ? findTargetClusterName(resource)
                      : undefined
                  }
                  resource={resource}
                  source={repository}
                />
              </Grid>
            ))}
          </Grid>
        </Section>
      ) : null}
    </Box>
  );
};
