import {
  GitRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';
import { ResourceCard } from '../ResourceCard';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { Section } from '../../UI';
import { findTargetClusterName } from '../../../utils/findTargetClusterName';
import { findKustomizationSource } from '../../../utils/findKustomizationSource';

type KustomizationDetailsProps = {
  kustomization: Kustomization;
  allKustomizations: Kustomization[];
  allGitRepositories: GitRepository[];
  allOCIRepositories: OCIRepository[];
  treeBuilder?: KustomizationTreeBuilder;
};

export const KustomizationDetails = ({
  kustomization,
  treeBuilder,
  allKustomizations,
  allGitRepositories,
  allOCIRepositories,
}: KustomizationDetailsProps) => {
  const source = findKustomizationSource(
    kustomization,
    allGitRepositories,
    allOCIRepositories,
  );

  const parentKustomization =
    treeBuilder?.findParentKustomization(kustomization);

  const parentSource = parentKustomization
    ? findKustomizationSource(parentKustomization, allGitRepositories, allOCIRepositories)
    : undefined;

  const dependsOn = kustomization.getDependsOn();
  const dependencies = dependsOn
    ? (dependsOn
        .map(d =>
          allKustomizations.find(
            k =>
              k.getName() === d.name &&
              k.getNamespace() ===
                (d.namespace ?? kustomization.getNamespace()),
          ),
        )
        .filter(k => Boolean(k)) as Kustomization[])
    : null;

  return (
    <Box>
      <Section heading="This Kustomization">
        <ResourceCard
          cluster={kustomization.cluster}
          kind={kustomization.getKind()}
          name={kustomization.getName()}
          namespace={kustomization.getNamespace()}
          targetCluster={findTargetClusterName(kustomization)}
          resource={kustomization}
          source={source}
          highlighted
        />
      </Section>

      {parentKustomization ? (
        <Section heading="Parent Kustomization">
          <ResourceCard
            cluster={parentKustomization.cluster}
            kind={parentKustomization.getKind()}
            name={parentKustomization.getName()}
            namespace={parentKustomization.getNamespace()}
            targetCluster={findTargetClusterName(parentKustomization)}
            resource={parentKustomization}
            source={parentSource}
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
                  source={findKustomizationSource(
                    resource,
                    allGitRepositories,
                    allOCIRepositories,
                  )}
                />
              </Grid>
            ))}
          </Grid>
        </Section>
      ) : null}
    </Box>
  );
};
