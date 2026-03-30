import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import { useEntity } from '@backstage/plugin-catalog-react';
import Grid from '@material-ui/core/Grid';
import Link from '@material-ui/core/Link';
import Typography from '@material-ui/core/Typography';
import {
  EntityDependencyOfComponentsCard,
  EntityDependsOnComponentsCard,
  EntityDependsOnResourcesCard,
} from '@backstage/plugin-catalog';

function DependenciesContent() {
  const { entity } = useEntity();
  const title = entity.metadata.title ?? entity.metadata.name;
  const projectSlug = entity.metadata.annotations?.['github.com/project-slug'];
  const depsUrl = projectSlug
    ? `https://github.com/${projectSlug}/network/dependencies`
    : undefined;

  return (
    <Grid container spacing={3} alignItems="stretch">
      <Grid item md={12}>
        <Typography variant="body2">
          Here we show only dependencies that are also included in the catalog.
          {depsUrl ? (
            <>
              {' '}
              Use the{' '}
              <Link href={depsUrl} target="_blank" rel="noopener noreferrer">
                GitHub dependencies page
              </Link>{' '}
              for a more complete overview.
            </>
          ) : (
            <>
              {' '}
              Use the GitHub dependencies page under <b>Insights</b> /{' '}
              <b>Dependency graph</b> for a more complete overview.
            </>
          )}
        </Typography>
      </Grid>
      <Grid item md={12}>
        <EntityDependsOnComponentsCard
          title={`Components ${title} depends on`}
        />
      </Grid>
      <Grid item md={12}>
        <EntityDependsOnResourcesCard
          title={`Resources ${title} depends on`}
        />
      </Grid>
      <Grid item md={12}>
        <EntityDependencyOfComponentsCard
          title={`Components depending on ${title}`}
        />
      </Grid>
    </Grid>
  );
}

export const DependenciesEntityContent = EntityContentBlueprint.make({
  name: 'dependencies',
  params: {
    path: '/dependencies',
    title: 'Dependencies',
    filter: entity =>
      entity.kind === 'Component' &&
      entity.spec?.type !== 'customer' &&
      entity.spec?.type !== 'template',
    loader: async () => <DependenciesContent />,
  },
});
