import {
  GitRepository,
  Kustomization,
  OCIRepository,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';
import { ResourceCard } from '../ResourceCard';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { Section } from '../../UI';
import { Progress } from '@backstage/core-components';

function useSource(kustomization: Kustomization): {
  resource?: GitRepository | OCIRepository;
  isLoading: boolean;
} {
  const sourceRef = kustomization.getSourceRef();

  let SourceClass: typeof GitRepository | typeof OCIRepository | undefined;
  if (sourceRef?.kind === 'GitRepository') {
    SourceClass = GitRepository;
  }
  if (sourceRef?.kind === 'OCIRepository') {
    SourceClass = OCIRepository;
  }

  const { resource, isLoading: isLoading } = useResource(
    kustomization.cluster,
    SourceClass!,
    {
      name: sourceRef!.name,
      namespace: sourceRef!.namespace ?? kustomization.getNamespace(),
    },
    {
      enabled: Boolean(SourceClass),
    },
  );

  return { resource, isLoading };
}

type KustomizationDetailsProps = {
  kustomization: Kustomization;
  allKustomizations: Kustomization[];
  treeBuilder: KustomizationTreeBuilder;
};

export const KustomizationDetails = ({
  kustomization,
  treeBuilder,
  allKustomizations,
}: KustomizationDetailsProps) => {
  const { resource: source } = useSource(kustomization);

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
        <Section heading="Parent Kustomization">
          <ResourceCard
            cluster={parentKustomization.cluster}
            kind={parentKustomization.getKind()}
            name={parentKustomization.getName()}
            namespace={parentKustomization.getNamespace()}
            resource={parentKustomization}
          />
        </Section>
      ) : null}

      <Section heading="This Kustomization">
        <ResourceCard
          cluster={kustomization.cluster}
          kind={kustomization.getKind()}
          name={kustomization.getName()}
          namespace={kustomization.getNamespace()}
          resource={kustomization}
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
