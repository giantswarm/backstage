import { useSearchParams } from 'react-router-dom';
import { Progress } from '@backstage/core-components';
import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid, makeStyles } from '@material-ui/core';
import { ResourceCard } from '../ResourceCard';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { Section } from '../../UI';

const useStyles = makeStyles(theme => ({
  root: {
    height: '100%',
    padding: theme.spacing(2, 3),
    backgroundColor: theme.palette.grey[200],
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[1],
    overflowY: 'auto',
  },
}));

type KustomizationDetailsProps = {
  treeBuilder: KustomizationTreeBuilder;
  kustomizations: Kustomization[];
  isLoading: boolean;
};

export const KustomizationDetails = ({
  treeBuilder,
  kustomizations,
  isLoading,
}: KustomizationDetailsProps) => {
  const [searchParams] = useSearchParams();
  const classes = useStyles();
  const cluster = searchParams.get('cluster');
  const kind = searchParams.get('kind');
  const namespace = searchParams.get('namespace');
  const name = searchParams.get('name');

  if (isLoading) {
    return <Progress />;
  }

  const kustomization = kustomizations.find(
    k => k.getNamespace() === namespace && k.getName() === name,
  );
  if (!kustomization) {
    return (
      <div>
        Kustomization {namespace}/{name} in cluster {cluster} not found.
      </div>
    );
  }

  const parentKustomization =
    treeBuilder.findParentKustomization(kustomization);

  const dependsOn = kustomization.getDependsOn();
  const dependencies = dependsOn
    ? (dependsOn
        .map(d =>
          kustomizations.find(
            k =>
              k.getName() === d.name &&
              k.getNamespace() ===
                (d.namespace ?? kustomization.getNamespace()),
          ),
        )
        .filter(k => Boolean(k)) as Kustomization[])
    : null;

  return (
    <Box className={classes.root}>
      <Section heading="Source"></Section>

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
            {dependencies.map(k => (
              <Grid item xs={12}>
                <ResourceCard
                  cluster={k.cluster}
                  kind={k.getKind()}
                  name={k.getName()}
                  namespace={k.getNamespace()}
                  resource={k}
                />
              </Grid>
            ))}
          </Grid>
        </Section>
      ) : null}
    </Box>
  );
};
