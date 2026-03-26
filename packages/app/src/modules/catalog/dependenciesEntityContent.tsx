import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import {
  EntityDependsOnComponentsCard,
  EntityDependsOnResourcesCard,
} from '@backstage/plugin-catalog';

const dependenciesEntityContent = EntityContentBlueprint.make({
  name: 'dependencies',
  params: {
    path: '/dependencies',
    title: 'Dependencies',
    filter: entity =>
      entity.kind === 'Component' &&
      entity.spec?.type !== 'customer' &&
      entity.spec?.type !== 'template',
    loader: async () => (
      <Grid container spacing={3} alignItems="stretch">
        <Grid item md={12}>
          <Typography variant="body2">
            Here we show only dependencies that are also included in the
            catalog. Use the GitHub dependencies page under <b>Insights</b> /{' '}
            <b>Dependency graph</b> for a more complete overview.
          </Typography>
        </Grid>
        <Grid item md={12}>
          <EntityDependsOnComponentsCard title="Dependencies of this component" />
        </Grid>
        <Grid item md={12}>
          <EntityDependsOnResourcesCard />
        </Grid>
      </Grid>
    ),
  },
});

export const catalogDependenciesExtension = createFrontendModule({
  pluginId: 'catalog',
  extensions: [dependenciesEntityContent],
});
