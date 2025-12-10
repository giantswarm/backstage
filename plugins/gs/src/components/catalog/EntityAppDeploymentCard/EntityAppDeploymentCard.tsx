import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import { Button, makeStyles, Typography } from '@material-ui/core';
import { appDeploymentTemplateRouteRef } from '../../../routes';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useCatalogEntityByRef } from '../../hooks';
import { QueryClientProvider } from '../../QueryClientProvider';

const TEMPLATE_NAME = 'app-deployment';

const useStyles = makeStyles(() => ({
  button: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
  },
}));

const CardContent = () => {
  const classes = useStyles();

  const { entity } = useEntity();

  const { entity: templateEntityGS } = useCatalogEntityByRef({
    kind: 'template',
    name: TEMPLATE_NAME,
    namespace: 'giantswarm',
  });

  const { entity: templateEntityDefault } = useCatalogEntityByRef({
    kind: 'template',
    name: TEMPLATE_NAME,
    namespace: 'default',
  });

  const templateEntity = templateEntityGS || templateEntityDefault;

  const templateRoute = useRouteRef(appDeploymentTemplateRouteRef);

  const href =
    templateRoute &&
    templateRoute({
      templateName: TEMPLATE_NAME,
      namespace: templateEntity?.metadata.namespace ?? 'default',
    });

  const searchParams = new URLSearchParams({
    formData: JSON.stringify({
      entityRef: stringifyEntityRef(entity),
    }),
  });

  const isDisabled = !templateEntity || !templateRoute;

  return (
    <InfoCard title="Deploy application">
      {isDisabled ? (
        <Typography variant="body2" color="textSecondary">
          App Deployment template not found
        </Typography>
      ) : (
        <Button
          variant="contained"
          disabled={isDisabled}
          className={classes.button}
          color="primary"
          href={`${href}?${searchParams.toString()}`}
        >
          Deploy application
        </Button>
      )}
    </InfoCard>
  );
};

export const EntityAppDeploymentCard = () => {
  return (
    <QueryClientProvider>
      <CardContent />
    </QueryClientProvider>
  );
};
