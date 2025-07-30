import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  OCIRepository,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';
import { ResourceCard } from '../ResourceCard';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { Section } from '../../UI';
import { Progress } from '@backstage/core-components';

function useSource(helmRelease: HelmRelease): {
  resource?: GitRepository | OCIRepository | HelmRepository;
  isLoading: boolean;
} {
  let SourceClass:
    | typeof OCIRepository
    | typeof GitRepository
    | typeof HelmRepository
    | undefined;
  let name: string = '';
  let namespace: string | undefined;

  const chart = helmRelease.getChart();
  const chartRef = helmRelease.getChartRef();
  if (!chart && chartRef) {
    if (chartRef.kind === 'OCIRepository') {
      SourceClass = OCIRepository;
      name = chartRef.name;
      namespace = chartRef.namespace ?? helmRelease.getNamespace();
    }
  }

  if (chart && chart.spec && chart.spec.sourceRef) {
    if (chart.spec.sourceRef.kind === 'GitRepository') {
      SourceClass = GitRepository;
    }
    if (chart.spec.sourceRef.kind === 'HelmRepository') {
      SourceClass = HelmRepository;
    }
    name = chart.spec.sourceRef.name;
    namespace = chart.spec.sourceRef.namespace ?? helmRelease.getNamespace();
  }

  const { resource, isLoading: isLoading } = useResource(
    helmRelease.cluster,
    SourceClass!,
    {
      name,
      namespace,
    },
    {
      enabled: Boolean(SourceClass),
    },
  );

  return { resource, isLoading };
}

type HelmReleaseDetailsProps = {
  helmRelease: HelmRelease;
  allHelmReleases: HelmRelease[];
  treeBuilder: KustomizationTreeBuilder;
};

export const HelmReleaseDetails = ({
  helmRelease,
  treeBuilder,
  allHelmReleases,
}: HelmReleaseDetailsProps) => {
  const { resource: source } = useSource(helmRelease);

  const parentKustomization = treeBuilder.findParentKustomization(helmRelease);

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
      <Section heading="Source">
        {source ? (
          <ResourceCard
            cluster={source.cluster}
            kind={source.getKind()}
            name={source.getName()}
            namespace={source.getNamespace()}
            resource={source}
          />
        ) : (
          <Progress />
        )}
      </Section>

      {parentKustomization ? (
        <Section heading="Kustomization">
          <ResourceCard
            cluster={parentKustomization.cluster}
            kind={parentKustomization.getKind()}
            name={parentKustomization.getName()}
            namespace={parentKustomization.getNamespace()}
            resource={parentKustomization}
          />
        </Section>
      ) : null}

      <Section heading="This HelmRelease">
        <ResourceCard
          cluster={helmRelease.cluster}
          kind={helmRelease.getKind()}
          name={helmRelease.getName()}
          namespace={helmRelease.getNamespace()}
          resource={helmRelease}
          highlighted
        />
      </Section>

      {dependencies ? (
        <Section heading="Dependencies">
          <Grid container spacing={3}>
            {dependencies.map(resource => (
              <Grid item xs={12}>
                <ResourceCard
                  cluster={resource.cluster}
                  kind={resource.getKind()}
                  name={resource.getName()}
                  namespace={resource.getNamespace()}
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
