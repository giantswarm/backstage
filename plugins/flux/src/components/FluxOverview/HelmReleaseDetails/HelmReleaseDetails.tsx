import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';
import { ResourceCard } from '../ResourceCard';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { Section } from '../../UI';

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
      <Section heading="Source"></Section>

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
