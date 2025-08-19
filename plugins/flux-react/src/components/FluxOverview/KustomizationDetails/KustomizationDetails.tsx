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

function useSource(
  kustomization: Kustomization,
  allGitRepositories: GitRepository[],
  allOCIRepositories: OCIRepository[],
): GitRepository | OCIRepository | undefined {
  const sourceRef = kustomization.getSourceRef();
  if (!sourceRef) {
    return undefined;
  }

  const name = sourceRef.name;
  const namespace = sourceRef.namespace ?? kustomization.getNamespace();

  if (sourceRef?.kind === GitRepository.kind) {
    return allGitRepositories.find(
      r => r.getName() === name && r.getNamespace() === namespace,
    );
  }

  if (sourceRef?.kind === OCIRepository.kind) {
    return allOCIRepositories.find(
      r => r.getName() === name && r.getNamespace() === namespace,
    );
  }

  return undefined;
}

type KustomizationDetailsProps = {
  kustomization: Kustomization;
  allKustomizations: Kustomization[];
  allGitRepositories: GitRepository[];
  allOCIRepositories: OCIRepository[];
  treeBuilder: KustomizationTreeBuilder;
};

export const KustomizationDetails = ({
  kustomization,
  treeBuilder,
  allKustomizations,
  allGitRepositories,
  allOCIRepositories,
}: KustomizationDetailsProps) => {
  const source = useSource(
    kustomization,
    allGitRepositories,
    allOCIRepositories,
  );

  const parentKustomization =
    treeBuilder.findParentKustomization(kustomization);

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
