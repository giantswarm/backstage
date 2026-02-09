import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';
import { ResourceCard } from '../ResourceCard';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { Section } from '../../UI';
import { findTargetClusterName } from '../../../utils/findTargetClusterName';

function useSource(
  helmRelease: HelmRelease,
  allOCIRepositories: OCIRepository[],
  allGitRepositories: GitRepository[],
  allHelmRepositories: HelmRepository[],
): GitRepository | OCIRepository | HelmRepository | undefined {
  const chart = helmRelease.getChart();
  const chartRef = helmRelease.getChartRef();
  if (!chart && chartRef) {
    if (chartRef.kind === OCIRepository.kind) {
      const name = chartRef.name;
      const namespace = chartRef.namespace ?? helmRelease.getNamespace();
      return allOCIRepositories.find(
        r => r.getName() === name && r.getNamespace() === namespace,
      );
    }
  }

  if (chart && chart.spec && chart.spec.sourceRef) {
    const name = chart.spec.sourceRef.name;
    const namespace =
      chart.spec.sourceRef.namespace ?? helmRelease.getNamespace();
    if (chart.spec.sourceRef.kind === 'GitRepository') {
      return allGitRepositories.find(
        r => r.getName() === name && r.getNamespace() === namespace,
      );
    }
    if (chart.spec.sourceRef.kind === 'HelmRepository') {
      return allHelmRepositories.find(
        r => r.getName() === name && r.getNamespace() === namespace,
      );
    }
  }

  return undefined;
}

type HelmReleaseDetailsProps = {
  helmRelease: HelmRelease;
  allHelmReleases: HelmRelease[];
  treeBuilder?: KustomizationTreeBuilder;
  allOCIRepositories: OCIRepository[];
  allGitRepositories: GitRepository[];
  allHelmRepositories: HelmRepository[];
};

export const HelmReleaseDetails = ({
  helmRelease,
  treeBuilder,
  allHelmReleases,
  allOCIRepositories,
  allGitRepositories,
  allHelmRepositories,
}: HelmReleaseDetailsProps) => {
  const source = useSource(
    helmRelease,
    allOCIRepositories,
    allGitRepositories,
    allHelmRepositories,
  );

  const parentKustomization = treeBuilder?.findParentKustomization(helmRelease);

  const dependsOn = helmRelease.getDependsOn();
  const dependencies = dependsOn
    ? (dependsOn
        .map(d =>
          allHelmReleases.find(
            k =>
              k.getName() === d.name &&
              k.getNamespace() === (d.namespace ?? helmRelease.getNamespace()),
          ),
        )
        .filter(k => Boolean(k)) as HelmRelease[])
    : null;

  return (
    <Box>
      <Section heading="This HelmRelease">
        <ResourceCard
          cluster={helmRelease.cluster}
          kind={helmRelease.getKind()}
          name={helmRelease.getName()}
          namespace={helmRelease.getNamespace()}
          targetCluster={findTargetClusterName(helmRelease)}
          resource={helmRelease}
          source={source}
          highlighted
        />
      </Section>

      {parentKustomization ? (
        <Section heading="Kustomization">
          <ResourceCard
            cluster={parentKustomization.cluster}
            kind={parentKustomization.getKind()}
            name={parentKustomization.getName()}
            namespace={parentKustomization.getNamespace()}
            targetCluster={findTargetClusterName(parentKustomization)}
            resource={parentKustomization}
          />
        </Section>
      ) : null}

      {source ? (
        <Section heading="Source">
          <ResourceCard
            cluster={source.cluster}
            kind={source.getKind()}
            name={source.getName()}
            namespace={source.getNamespace()}
            resource={source}
          />
        </Section>
      ) : null}

      {dependencies ? (
        <Section heading="Dependencies">
          <Grid container spacing={3}>
            {dependencies.map(resource => (
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
                  targetCluster={findTargetClusterName(resource)}
                  resource={resource}
                />
              </Grid>
            ))}
          </Grid>
        </Section>
      ) : null}
    </Box>
  );
};
